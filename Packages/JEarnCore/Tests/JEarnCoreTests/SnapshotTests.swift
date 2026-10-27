import Testing
import Foundation
@testable import JEarnCore

private struct World {
    var ledger = Ledger()
    let bank = Account(name: "Bank", type: .bank, createdAt: now, updatedAt: now)
    let card = Account(name: "Card", type: .credit, archivedAt: now, createdAt: now, updatedAt: now)
    let coffee = SubCategory(name: "Coffee", budgets: [BudgetEntry(from: ym(2026, 1), amountMinor: 500)], createdAt: now, updatedAt: now)
    let salary = IncomeCategory(name: "Salary", createdAt: now, updatedAt: now)
    var food: ExpenseCategory
    var currency = Currency.aud
    init() {
        food = ExpenseCategory(name: "Food", budgets: [BudgetEntry(from: ym(2026, 1), amountMinor: 50_000)], rollover: true,
                               rollStart: ym(2026, 9), subs: [coffee], createdAt: now, updatedAt: now)
        try! ledger.postOpening(account: bank.id, class: .bank, amountMinor: 100_000, date: day(2026, 9, 1), now: now, timeZone: utc)
        try! ledger.postOpening(account: card.id, class: .credit, amountMinor: 3_000, date: day(2026, 9, 1), now: now, timeZone: utc)
        let e = try! ledger.post(kind: .expense, date: day(2026, 10, 5), debit: coffee.id, credit: bank.id, amountMinor: 1250, note: "flat white", now: now, timeZone: utc)
        try! ledger.post(kind: .income, date: day(2026, 10, 6), debit: bank.id, credit: salary.id, amountMinor: 9_000, now: now, timeZone: utc)
        try! ledger.post(kind: .transfer, date: day(2026, 10, 7), debit: card.id, credit: bank.id, amountMinor: 500, now: now, timeZone: utc)
        try! ledger.void(entryID: e.id, now: now)
    }
    func snapshot() throws -> Snapshot {
        try Snapshot.make(ledger: ledger, accounts: [bank, card], expenseCategories: [food], incomeCategories: [salary],
                          currency: currency, appVersion: "1.0", exportedAt: now)
    }
}

private func roundTrip(_ s: Snapshot) throws -> Snapshot.Imported { try Snapshot.importData(try s.json()) }

@Suite struct SnapshotFormatTests {
    @Test func roundTripGivesEqualData() throws {
        let w = World()
        let got = try roundTrip(try w.snapshot())
        #expect(got.ledger == w.ledger)
        #expect(got.accounts == [w.bank, w.card])
        #expect(got.expenseCategories == [w.food])
        #expect(got.incomeCategories == [w.salary])
        #expect(got.currency == .aud)
    }
    @Test func roundTripJPY() throws {
        var w = World()
        w.currency = .jpy
        #expect(try roundTrip(try w.snapshot()).currency == .jpy)
    }
    @Test func jsonShape() throws {
        let w = World()
        let s = try w.snapshot()
        let json = String(decoding: try s.json(), as: UTF8.self)
        #expect(s.schemaVersion == 1 && s.appVersion == "1.0" && s.currency == "AUD")
        #expect(s.entries.map(\.seq) == [1, 2, 3, 4, 5, 6])
        #expect(s.entries[0].debitName == "Bank" && s.entries[0].creditName == "Opening Balances")
        #expect(s.entries[1].debitName == "Opening Balances" && s.entries[1].creditName == "Card")
        #expect(s.entries[2].debitName == "Coffee" && s.entries[2].creditName == "Bank")
        #expect(json.contains("\"amountMinor\" : 1250"))
        #expect(json.contains("\"date\" : \"2026-10-05\""))
        #expect(json.contains("\"from\" : \"2026-01\""))
        #expect(json.contains("\"rollStart\" : \"2026-09\""))
        #expect(json.contains("\"recordedAt\" : \"2026-10-27T00:00:00Z\""))
        #expect(json.contains("\"exportedAt\" : \"2026-10-27T00:00:00Z\""))
        let keys = ["accounts", "appVersion", "currency", "entries", "expenseCategories", "exportedAt", "incomeCategories", "schemaVersion"]
        let positions = keys.map { json.range(of: "\n  \"\($0)\"")!.lowerBound }
        #expect(positions == positions.sorted())
    }
    @Test func unknownIDAtExportThrows() {
        var w = World()
        try! w.ledger.post(kind: .expense, date: day(2026, 10, 8), debit: UUID(), credit: w.bank.id, amountMinor: 1, now: now, timeZone: utc)
        #expect(throws: SnapshotError.unknownAccount) { try w.snapshot() }
    }
}

@Suite struct SnapshotImportTests {
    private func reject(_ error: SnapshotError, _ edit: (inout Snapshot) -> Void) throws {
        var s = try World().snapshot()
        edit(&s)
        #expect(throws: error) { try roundTrip(s) }
    }
    @Test func schemaVersion() throws { try reject(.unsupportedSchemaVersion(2)) { $0.schemaVersion = 2 } }
    @Test func seqGap() throws { try reject(.badSequence) { $0.entries[3].seq = 9 } }
    @Test func seqDuplicate() throws { try reject(.badSequence) { $0.entries[1].seq = 1 } }
    @Test func seqMustStartAtOne() throws { try reject(.badSequence) { $0.entries.removeFirst() } }
    @Test func zeroAmount() throws { try reject(.invalidAmount) { $0.entries[2].amountMinor = 0 } }
    @Test func negativeAmount() throws { try reject(.invalidAmount) { $0.entries[2].amountMinor = -1 } }
    @Test func debitEqualsCredit() throws { try reject(.sameDebitCredit) { $0.entries[2].creditId = $0.entries[2].debitId } }
    @Test func unknownDebit() throws { try reject(.unknownAccount) { $0.entries[2].debitId = UUID() } }
    @Test func unknownCredit() throws { try reject(.unknownAccount) { $0.entries[2].creditId = UUID() } }
    @Test func reversalOfLaterEntry() throws {
        try reject(.badReversal) { $0.entries[5].reverses = $0.entries[5].id; }
    }
    @Test func reversalReferencesUnknown() throws { try reject(.badReversal) { $0.entries[5].reverses = UUID() } }
    @Test func reversalOfReversal() throws {
        try reject(.badReversal) {
            $0.entries[4].kind = .reversal
            $0.entries[4].reverses = $0.entries[2].id
            $0.entries[5].reverses = $0.entries[4].id
        }
    }
    @Test func reversedTwice() throws {
        try reject(.badReversal) {
            $0.entries[4].kind = .reversal
            $0.entries[4].reverses = $0.entries[2].id
        }
    }
    @Test func reversalDifferentAmount() throws { try reject(.badReversal) { $0.entries[5].amountMinor = 1 } }
    @Test func reversalWrongDirection() throws {
        try reject(.badReversal) { ($0.entries[5].debitId, $0.entries[5].creditId) = ($0.entries[5].creditId, $0.entries[5].debitId) }
    }
    @Test func reversalDifferentAccounts() throws {
        try reject(.badReversal) { $0.entries[5].debitId = $0.entries[1].creditId }
    }
    @Test func reversalDifferentDate() throws { try reject(.badReversal) { $0.entries[5].date = "2026-10-06" } }
    @Test func duplicateId() throws { try reject(.duplicateId) { $0.entries[3].id = $0.entries[2].id } }
    @Test func reversalWithoutTarget() throws { try reject(.badReversal) { $0.entries[5].reverses = nil } }
    @Test func nonReversalWithTarget() throws { try reject(.badReversal) { $0.entries[3].reverses = $0.entries[2].id } }
    @Test func dateAfterExportDay() throws { try reject(.dateAfterExport) { $0.entries[2].date = "2026-10-28" } }
    @Test func localTodayAheadOfUTCAllowed() throws {
        var s = try World().snapshot()
        s.exportedAt = day(2026, 10, 27).addingTimeInterval(12 * 3600)  // 28 Oct 02:00 in UTC+14
        s.entries[2].date = "2026-10-28"
        s.entries[5].date = "2026-10-28"  // keep the reversal mirroring its target
        _ = try roundTrip(s)
    }
    @Test func badDateString() throws { try reject(.malformed) { $0.entries[2].date = "2026-02-30" } }
    @Test func unknownCurrency() throws { try reject(.malformed) { $0.currency = "XXX" } }
    @Test func notJSON() {
        #expect(throws: SnapshotError.malformed) { try Snapshot.importData(Data("nope".utf8)) }
    }
}
