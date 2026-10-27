import Testing
import Foundation
@testable import JEarnCore

@Suite struct ReferenceDataTests {
    @Test func pickersHideArchived() {
        let a = Account(name: "A"), b = Account(name: "B", archivedAt: now)
        #expect([a, b].active.map(\.name) == ["A"])
        let i = IncomeCategory(name: "Pay"), j = IncomeCategory(name: "Old", archivedAt: now)
        #expect([i, j].active.map(\.name) == ["Pay"])
        let cats = [ExpenseCategory(name: "Food", subs: [SubCategory(name: "Latte"), SubCategory(name: "Old", archivedAt: now)]),
                    ExpenseCategory(name: "Gone", archivedAt: now)]
        #expect(cats.pickable.map(\.name) == ["Food"])
        #expect(cats.pickable[0].subs.map(\.name) == ["Latte"])
    }
    @Test func emptyLedgerGates() throws {
        var l = Ledger()
        #expect(l.canChangeCurrency && l.canLoadSampleData && l.canImport)
        try l.postOpening(account: UUID(), class: .bank, amountMinor: 1, date: now, now: now, timeZone: utc)
        #expect(!l.canChangeCurrency && !l.canLoadSampleData && !l.canImport)
    }
    @Test func subBudgetOverflow() {
        let m = ym(2026, 10)
        func cat(_ budget: Int64, _ subs: [Int64], archived: Bool = false) -> ExpenseCategory {
            ExpenseCategory(name: "C", budgets: [BudgetEntry(from: ym(2026, 1), amountMinor: budget)],
                            subs: subs.map { SubCategory(name: "S", budgets: [BudgetEntry(from: ym(2026, 1), amountMinor: $0)]) })
        }
        #expect(cat(1_000, [600, 500]).subBudgetOverflow(in: m) == SubBudgetOverflow(subsTotalMinor: 1_100, categoryMinor: 1_000))
        #expect(cat(1_000, [600, 400]).subBudgetOverflow(in: m) == nil)  // equal is fine
        #expect(cat(1_000, []).subBudgetOverflow(in: m) == nil)
        var c = cat(1_000, [600, 500])
        c.subs[1].archivedAt = now  // archived subs are not counted
        #expect(c.subBudgetOverflow(in: m) == nil)
        c.subs[1].archivedAt = nil
        c.budgets = setBudget(c.budgets, from: ym(2026, 11), amountMinor: 2_000)  // uses the budget at that month
        #expect(c.subBudgetOverflow(in: m) != nil && c.subBudgetOverflow(in: ym(2026, 11)) == nil)
    }
}
