import Testing
import Foundation
@testable import JEarnCore

private let bank = UUID(), cash = UUID(), cat = UUID(), sub = UUID(), inc = UUID()
private func draft(_ type: TxType, _ expr: String = "12.5") -> TransactionDraft {
    var d = TransactionDraft(type: type, accountId: bank, date: now)
    d.expression = expr
    switch type {
    case .expense: d.categoryId = cat
    case .income: d.categoryId = inc
    case .transfer: d.toAccountId = cash
    }
    return d
}
private func check(_ d: TransactionDraft) throws { try d.validate(currency: .aud, now: now, timeZone: utc) }

@Suite struct DraftTests {
    @Test func validDraftsPass() throws {
        for t in [TxType.expense, .income, .transfer] { try check(draft(t)); #expect(draft(t).isValid(currency: .aud, now: now, timeZone: utc)) }
    }
    @Test func amountMustBePositive() {
        for e in ["", "0", "5-9", "+"] { #expect(throws: DraftError.invalidAmount) { try check(draft(.expense, e)) } }
        #expect(!draft(.expense, "").isValid(currency: .aud, now: now, timeZone: utc))
    }
    @Test func transferNeedsDifferentAccounts() {
        var d = draft(.transfer)
        d.toAccountId = bank
        #expect(throws: DraftError.sameAccount) { try check(d) }
        d.toAccountId = nil
        #expect(throws: DraftError.missingAccount) { try check(d) }
        var e = draft(.expense)
        e.accountId = nil
        #expect(throws: DraftError.missingAccount) { try check(e) }
    }
    @Test func dateNotAfterToday() {
        var d = draft(.expense)
        d.date = day(2026, 10, 28)
        #expect(throws: DraftError.dateInFuture) { try check(d) }
    }
    @Test func categoryRules() {
        var d = draft(.expense)
        d.categoryId = nil
        #expect(throws: DraftError.missingCategory) { try check(d) }
        d.subcategoryId = sub  // a subcategory alone is enough
        #expect(throws: Never.self) { try check(d) }
        var i = draft(.income)
        i.categoryId = nil
        #expect(throws: DraftError.missingCategory) { try check(i) }
    }
    @Test func postMapsDebitCredit() throws {
        var l = Ledger()
        var d = draft(.expense, "(10+2.5)")
        d.subcategoryId = sub
        d.note = "  lunch \n"
        let e = try d.post(into: &l, currency: .aud, now: now, timeZone: utc)
        #expect(e.kind == .expense && e.debitID == sub && e.creditID == bank && e.amountMinor == 1250 && e.note == "lunch")
        let e2 = try draft(.expense).post(into: &l, currency: .aud, now: now, timeZone: utc)
        #expect(e2.debitID == cat && e2.creditID == bank)
        let i = try draft(.income).post(into: &l, currency: .aud, now: now, timeZone: utc)
        #expect(i.kind == .income && i.debitID == bank && i.creditID == inc)
        let t = try draft(.transfer).post(into: &l, currency: .aud, now: now, timeZone: utc)
        #expect(t.kind == .transfer && t.debitID == cash && t.creditID == bank)
        #expect(l.entries.count == 4)
    }
    @Test func invalidPostLeavesLedgerUntouched() {
        var l = Ledger()
        #expect(throws: DraftError.invalidAmount) { try draft(.expense, "").post(into: &l, currency: .aud, now: now, timeZone: utc) }
        #expect(l.entries.isEmpty)
    }
    @Test func jpyAmount() throws {
        var l = Ledger()
        let e = try draft(.expense, "1500").post(into: &l, currency: .jpy, now: now, timeZone: utc)
        #expect(e.amountMinor == 1500)
    }
}
