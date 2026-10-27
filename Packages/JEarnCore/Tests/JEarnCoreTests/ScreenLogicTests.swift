import Testing
import Foundation
@testable import JEarnCore

private struct Shop {
    var ledger = Ledger()
    let bank = Account(name: "Bank"), card = Account(name: "Card", type: .credit, archivedAt: now)
    let latte = SubCategory(name: "Latte")
    let food: ExpenseCategory, fun = ExpenseCategory(name: "Fun")
    let salary = IncomeCategory(name: "Salary")
    init() { food = ExpenseCategory(name: "Food", subs: [latte]) }
    var dir: Directory { Directory(accounts: [bank, card], expense: [food, fun], income: [salary]) }
    @discardableResult
    mutating func post(_ kind: EntryKind, _ d: Date, _ debit: UUID, _ credit: UUID, _ amt: Int64 = 100, note: String = "") -> Entry {
        try! ledger.post(kind: kind, date: d, debit: debit, credit: credit, amountMinor: amt, note: note, now: now, timeZone: utc)
    }
}

@Suite struct HomeListTests {
    @Test func groupsByDayNewestFirstWithLabels() {
        var s = Shop()
        s.post(.expense, day(2026, 10, 6), s.latte.id, s.bank.id)
        let b = s.post(.expense, day(2026, 10, 27), s.latte.id, s.bank.id)
        let c = s.post(.income, day(2026, 10, 27), s.bank.id, s.salary.id)
        s.post(.expense, day(2026, 10, 26), s.fun.id, s.bank.id)
        s.post(.expense, day(2026, 9, 30), s.fun.id, s.bank.id)  // other month
        let sections = s.ledger.homeSections(month: ym(2026, 10), directory: s.dir, today: day(2026, 10, 27), currency: .aud)
        #expect(sections.map(\.label) == ["Today", "Yesterday", "Tue 6 Oct"])
        #expect(sections[0].rows.map(\.id) == [c.id, b.id])  // seq desc within a day
        #expect(sections.map(\.rows.count) == [2, 1, 1])
    }
    @Test func dayLabelFormat() {
        #expect(dayLabel(day(2026, 10, 5), today: day(2026, 10, 27)) == "Mon 5 Oct")
        #expect(dayLabel(day(2025, 1, 1), today: day(2026, 10, 27)) == "Wed 1 Jan")
        #expect(dayLabel(day(2026, 10, 27), today: day(2026, 10, 27)) == "Today")
        #expect(dayLabel(day(2026, 11, 1), today: day(2026, 11, 2)) == "Yesterday")
    }
    @Test func hidesVoidedReversalsAndOpenings() {
        var s = Shop()
        s.post(.opening, now, s.bank.id, openingBalancesID)
        let e = s.post(.expense, now, s.latte.id, s.bank.id)
        try! s.ledger.void(entryID: e.id, now: now)
        #expect(s.ledger.homeSections(month: ym(2026, 10), directory: s.dir, today: now, currency: .aud).isEmpty)
    }
    @Test func expenseRowWithSub() {
        var s = Shop()
        s.post(.expense, now, s.latte.id, s.bank.id, 450, note: "morning")
        let r = s.ledger.homeSections(month: ym(2026, 10), directory: s.dir, today: now, currency: .aud)[0].rows[0]
        #expect(r.title == "Latte" && r.meta == "Food \u{00B7} Bank \u{00B7} morning")
        #expect(r.kind == .expense && r.amountText == "\u{2212}$4.50")
    }
    @Test func expenseRowWithoutSubOrNoteOmitsParts() {
        var s = Shop()
        s.post(.expense, now, s.fun.id, s.bank.id)
        let r = s.ledger.homeSections(month: ym(2026, 10), directory: s.dir, today: now, currency: .aud)[0].rows[0]
        #expect(r.title == "Fun" && r.meta == "Fun \u{00B7} Bank")
    }
    @Test func incomeRow() {
        var s = Shop()
        s.post(.income, now, s.bank.id, s.salary.id, 9_000)
        let r = s.ledger.homeSections(month: ym(2026, 10), directory: s.dir, today: now, currency: .aud)[0].rows[0]
        #expect(r.title == "Salary" && r.meta == "Bank" && r.kind == .income && r.amountText == "+$90.00")
    }
    @Test func transferRowAndArchivedNames() {
        var s = Shop()
        s.post(.transfer, now, s.card.id, s.bank.id, 500)  // to archived card
        let r = s.ledger.homeSections(month: ym(2026, 10), directory: s.dir, today: now, currency: .aud)[0].rows[0]
        #expect(r.title == "Transfer" && r.meta == "Bank \u{2192} Card" && r.kind == .transfer && r.amountText == "$5.00")
    }
}
