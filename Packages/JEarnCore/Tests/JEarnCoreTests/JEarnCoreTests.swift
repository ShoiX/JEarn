import Testing
import Foundation
@testable import JEarnCore

private let cal: Calendar = {
    var c = Calendar(identifier: .gregorian)
    c.timeZone = TimeZone(identifier: "UTC")!
    return c
}()
private func day(_ y: Int, _ m: Int, _ d: Int = 10) -> Date {
    cal.date(from: DateComponents(year: y, month: m, day: d, hour: 12))!
}
private func ym(_ y: Int, _ m: Int) -> YearMonth { YearMonth(year: y, month: m) }
private let now = day(2026, 10, 27)

private func ev(_ s: String, _ c: Currency = .aud) -> Decimal? { evaluate(s, currency: c) }

@Suite struct EvaluatorTests {
    @Test func basics() {
        #expect(ev("(12+3)×2") == 30)
        #expect(ev("2+3*4") == 14)
        #expect(ev("10/4") == 2.5)
        #expect(ev("10÷4−1") == 1.5)
        #expect(ev("-5+2") == -3)
        #expect(ev("2*-3") == -6)
    }
    @Test func implicitMultiplication() {
        #expect(ev("2(3+1)") == 8)
        #expect(ev("(2)(3)") == 6)
    }
    @Test func unclosedAndTrailing() {
        #expect(ev("(2+3") == 5)
        #expect(ev("2*(3+4") == 14)
        #expect(ev("5+") == 5)
        #expect(ev("5+*/-") == 5)
        #expect(ev("(5+") == 5)
    }
    @Test func invalid() {
        #expect(ev("") == nil)
        #expect(ev("+") == nil)
        #expect(ev("1/0") == nil)
        #expect(ev("5÷(3−3)") == nil)
        #expect(ev("1.2.3") == nil)
        #expect(ev(".") == nil)
        #expect(ev("2)") == nil)
        #expect(ev("abc") == nil)
    }
    @Test func rounding() {
        #expect(ev("1/3") == Decimal(string: "0.33"))
        #expect(ev("0.125") == Decimal(string: "0.13"))
        #expect(ev("-0.125") == Decimal(string: "-0.13"))
        #expect(ev("0.1+0.2") == Decimal(string: "0.3"))
        #expect(ev("10/4", .jpy) == 3)
        #expect(ev("2.5", .jpy) == 3)
    }
}

@Suite struct MoneyTests {
    @Test func minorUnits() {
        #expect(Currency.aud.minorUnits(Decimal(string: "12.345")!) == 1235)
        #expect(Currency.aud.minorUnits(Decimal(string: "-12.345")!) == -1235)
        #expect(Currency.jpy.minorUnits(Decimal(string: "1234.5")!) == 1235)
        #expect(Currency.jpy.minorUnits(1000) == 1000)
        #expect(Currency.aud.minorUnits(1000) == 100_000)
        #expect(Currency.all.count == 10)
    }
    @Test func yearMonth() {
        #expect(ym(2026, 12).next == ym(2027, 1))
        #expect(ym(2026, 1).previous == ym(2025, 12))
        #expect(ym(2026, 9) < ym(2026, 10))
        #expect(ym(2026, 3).description == "2026-03")
        #expect(YearMonth("2026-03") == ym(2026, 3))
        #expect(YearMonth("2026-13") == nil)
        #expect(YearMonth(day(2026, 10, 31), calendar: cal) == ym(2026, 10))
        var syd = cal
        syd.timeZone = TimeZone(identifier: "Australia/Sydney")!
        #expect(YearMonth(day(2026, 10, 31).addingTimeInterval(12 * 3600), calendar: syd) == ym(2026, 11))
    }
}

private struct Fixture {
    var ledger = Ledger()
    let bank = UUID(), card = UUID(), cash = UUID()
    let rent = UUID(), food = UUID(), coffee = UUID(), salary = UUID()
    let home: ExpenseCategory
    let incomeCats: [IncomeCategory]
    init() {
        home = ExpenseCategory(id: rent, name: "Home", budgets: [BudgetEntry(from: ym(2026, 1), amountMinor: 50_000)])
        incomeCats = [IncomeCategory(id: salary, name: "Salary")]
    }
    mutating func spend(_ amt: Int64, _ to: UUID, _ d: Date, from: UUID? = nil) throws -> Entry {
        try ledger.post(kind: .expense, date: d, debit: to, credit: from ?? bank, amountMinor: amt, now: now)
    }
}

@Suite struct LedgerTests {
    @Test func postValidation() {
        var l = Ledger()
        let a = UUID(), b = UUID()
        #expect(throws: LedgerError.invalidAmount) { try l.post(kind: .expense, date: now, debit: a, credit: b, amountMinor: 0, now: now) }
        #expect(throws: LedgerError.invalidAmount) { try l.post(kind: .expense, date: now, debit: a, credit: b, amountMinor: -5, now: now) }
        #expect(throws: LedgerError.sameAccount) { try l.post(kind: .transfer, date: now, debit: a, credit: a, amountMinor: 5, now: now) }
        #expect(throws: LedgerError.reversalNotPostable) { try l.post(kind: .reversal, date: now, debit: a, credit: b, amountMinor: 5, now: now) }
        #expect(l.entries.isEmpty)
    }
    @Test func seqAndRecordedAt() throws {
        var l = Ledger()
        let a = UUID(), b = UUID()
        let e1 = try l.post(kind: .expense, date: day(2026, 1), debit: a, credit: b, amountMinor: 5, now: now)
        let e2 = try l.void(entryID: e1.id, now: now)
        #expect(e1.seq == 1 && e2.seq == 2)
        #expect(e1.recordedAt == now)
        #expect(e2.debitID == b && e2.creditID == a && e2.date == e1.date && e2.reverses == e1.id)
    }
    @Test func voidErrors() throws {
        var l = Ledger()
        let e = try l.post(kind: .expense, date: now, debit: UUID(), credit: UUID(), amountMinor: 5, now: now)
        let r = try l.void(entryID: e.id, now: now)
        #expect(l.isVoided(e.id))
        #expect(throws: LedgerError.alreadyVoided) { try l.void(entryID: e.id, now: now) }
        #expect(throws: LedgerError.cannotVoidReversal) { try l.void(entryID: r.id, now: now) }
        #expect(throws: LedgerError.entryNotFound) { try l.void(entryID: UUID(), now: now) }
        #expect(l.entries.count == 2)
    }
    @Test func visibleEntries() throws {
        var l = Ledger()
        let a = UUID(), b = UUID()
        _ = try l.post(kind: .opening, date: now, debit: a, credit: openingBalancesID, amountMinor: 100, now: now)
        let e1 = try l.post(kind: .expense, date: now, debit: b, credit: a, amountMinor: 5, now: now)
        let e2 = try l.post(kind: .income, date: now, debit: a, credit: b, amountMinor: 7, now: now)
        _ = try l.void(entryID: e1.id, now: now)
        #expect(l.visibleEntries.map(\.id) == [e2.id])
    }
    @Test func balances() throws {
        var f = Fixture()
        // asset with opening 1000, liability card with opening debt 300
        _ = try f.ledger.post(kind: .opening, date: now, debit: f.bank, credit: openingBalancesID, amountMinor: 100_000, now: now)
        _ = try f.ledger.post(kind: .opening, date: now, debit: openingBalancesID, credit: f.card, amountMinor: 30_000, now: now)
        #expect(f.ledger.assetBalance(f.bank) == 100_000)
        #expect(f.ledger.liabilityBalance(f.card) == 30_000)
        _ = try f.spend(2_500, f.food, now, from: f.card)  // card owed rises
        _ = try f.spend(1_000, f.food, now)                // bank falls
        _ = try f.ledger.post(kind: .transfer, date: now, debit: f.card, credit: f.bank, amountMinor: 5_000, now: now)  // pay card
        #expect(f.ledger.balance(of: f.bank, class: .bank) == 100_000 - 1_000 - 5_000)
        #expect(f.ledger.balance(of: f.card, class: .credit) == 30_000 + 2_500 - 5_000)
    }
}

@Suite struct BudgetTests {
    @Test func budgetAtAndSet() {
        #expect(budgetAt([], ym(2026, 1)) == 0)
        var b = [BudgetEntry(from: ym(2026, 3), amountMinor: 100)]
        #expect(budgetAt(b, ym(2026, 1)) == 100)  // before first entry -> earliest
        b = setBudget(b, from: ym(2026, 6), amountMinor: 200)
        #expect(budgetAt(b, ym(2026, 5)) == 100)
        #expect(budgetAt(b, ym(2026, 6)) == 200)
        #expect(budgetAt(b, ym(2027, 1)) == 200)
        b = setBudget(b, from: ym(2026, 4), amountMinor: 300)  // drops later entries
        #expect(b.count == 2)
        #expect(budgetAt(b, ym(2026, 3)) == 100)
        #expect(budgetAt(b, ym(2026, 4)) == 300)
        #expect(budgetAt(b, ym(2026, 9)) == 300)
        b = setBudget(b, from: ym(2026, 3), amountMinor: 50)  // replaces the same-month entry
        #expect(b == [BudgetEntry(from: ym(2026, 3), amountMinor: 50)])
    }
}

@Suite struct AggregateTests {
    @Test func spentIncomeAndVoid() throws {
        var f = Fixture()
        let food = ExpenseCategory(id: f.food, name: "Food", subs: [SubCategory(id: f.coffee, name: "Coffee")])
        _ = try f.spend(1_000, f.food, day(2026, 10))
        let c = try f.spend(400, f.coffee, day(2026, 10))
        _ = try f.ledger.post(kind: .income, date: day(2026, 10), debit: f.bank, credit: f.salary, amountMinor: 9_000, now: now)
        #expect(f.ledger.spent(food, in: ym(2026, 10), calendar: cal) == 1_400)
        #expect(f.ledger.spent(food.subs[0], in: ym(2026, 10), calendar: cal) == 400)
        #expect(f.ledger.income(f.incomeCats, in: ym(2026, 10), calendar: cal) == 9_000)
        #expect(f.ledger.spent(food, in: ym(2026, 9), calendar: cal) == 0)
        _ = try f.ledger.void(entryID: c.id, now: now)
        #expect(f.ledger.spent(food, in: ym(2026, 10), calendar: cal) == 1_000)
        #expect(f.ledger.spent(food.subs[0], in: ym(2026, 10), calendar: cal) == 0)
    }
    @Test func backdatedVoidNetsEarlierMonthToZero() throws {
        var f = Fixture()
        let e = try f.spend(700, f.rent, day(2026, 8))
        let later = day(2026, 10, 20)
        _ = try f.ledger.void(entryID: e.id, now: later)  // recorded in Oct, dated Aug
        #expect(f.ledger.spent(f.home, in: ym(2026, 8), calendar: cal) == 0)
        #expect(f.ledger.spent(f.home, in: ym(2026, 10), calendar: cal) == 0)
    }
    @Test func transfersAndOpeningExcluded() throws {
        var f = Fixture()
        _ = try f.ledger.post(kind: .opening, date: now, debit: f.bank, credit: openingBalancesID, amountMinor: 5_000, now: now)
        _ = try f.ledger.post(kind: .transfer, date: now, debit: f.cash, credit: f.bank, amountMinor: 1_000, now: now)
        let m = ym(2026, 10)
        #expect(f.ledger.totalSpent([f.home], in: m, calendar: cal) == 0)
        #expect(f.ledger.income(f.incomeCats, in: m, calendar: cal) == 0)
        let r = f.ledger.monthReport(m, expense: [f.home], income: f.incomeCats, calendar: cal)
        #expect(r.incomeMinor == 0 && r.spentMinor == 0 && r.categories.isEmpty)
    }
    @Test func rolloverAcrossMonths() throws {
        var f = Fixture()
        var cat = ExpenseCategory(id: f.rent, name: "Home", budgets: [BudgetEntry(from: ym(2026, 1), amountMinor: 10_000)],
                                  rollover: true, rollStart: ym(2026, 7))
        _ = try f.spend(7_000, f.rent, day(2026, 7))   // +3000
        _ = try f.spend(15_000, f.rent, day(2026, 8))  // -5000 -> carry -2000
        _ = try f.spend(2_000, f.rent, day(2026, 9))   // +8000 -> carry 6000
        _ = try f.spend(4_000, f.rent, day(2026, 10))
        let l = f.ledger
        #expect(l.carryover(cat, to: ym(2026, 7), calendar: cal) == 0)
        #expect(l.carryover(cat, to: ym(2026, 8), calendar: cal) == 3_000)
        #expect(l.carryover(cat, to: ym(2026, 9), calendar: cal) == -2_000)  // overspend goes negative
        #expect(l.carryover(cat, to: ym(2026, 10), calendar: cal) == 6_000)
        #expect(l.available(cat, in: ym(2026, 10), calendar: cal) == 16_000)
        #expect(l.leftToSpend([cat], in: ym(2026, 10), calendar: cal) == 12_000)
        cat.rollover = false
        #expect(l.carryover(cat, to: ym(2026, 10), calendar: cal) == 0)
    }
    @Test func rolloverUsesBudgetHistoryAndVoids() throws {
        var f = Fixture()
        var cat = ExpenseCategory(id: f.rent, name: "Home", budgets: [BudgetEntry(from: ym(2026, 1), amountMinor: 100)],
                                  rollover: true, rollStart: ym(2026, 1))
        cat.budgets = setBudget(cat.budgets, from: ym(2026, 3), amountMinor: 200)
        let e = try f.spend(100, f.rent, day(2026, 1))
        #expect(f.ledger.carryover(cat, to: ym(2026, 4), calendar: cal) == 300)  // Jan 0 (spent 100) + Feb 100 + Mar 200
        _ = try f.ledger.void(entryID: e.id, now: now)
        // Jan 100, Feb 100, Mar 200 = 400 after the backdated void
        #expect(f.ledger.carryover(cat, to: ym(2026, 4), calendar: cal) == 400)
    }
    @Test func sixMonthReport() throws {
        var f = Fixture()
        let cat = ExpenseCategory(id: f.rent, name: "Home", budgets: [BudgetEntry(from: ym(2026, 1), amountMinor: 1_000)])
        // May..Sep completed, Oct current
        for (i, m) in [5, 6, 7, 8, 9].enumerated() {
            _ = try f.spend(Int64(1_000 + i * 100), f.rent, day(2026, m))  // 1000..1400, avg 1200
            _ = try f.ledger.post(kind: .income, date: day(2026, m), debit: f.bank, credit: f.salary, amountMinor: 5_000, now: now)
        }
        _ = try f.spend(9_999, f.rent, day(2026, 10))  // current month excluded from averages
        _ = try f.ledger.post(kind: .income, date: day(2026, 4), debit: f.bank, credit: f.salary, amountMinor: 77_777, now: now)  // outside window
        let r = f.ledger.sixMonthReport(now: now, expense: [cat], income: f.incomeCats, calendar: cal)
        #expect(r.months.map(\.month) == [ym(2026, 5), ym(2026, 6), ym(2026, 7), ym(2026, 8), ym(2026, 9), ym(2026, 10)])
        #expect(r.months.last?.spentMinor == 9_999)
        #expect(r.averageSpentMinor == 1_200)
        #expect(r.averageIncomeMinor == 5_000)
        #expect(r.categories.first?.averageMinor == 1_200)
        #expect(r.categories.first?.isOverBudget == true)
    }
    @Test func monthReportSortedWithPercent() throws {
        var f = Fixture()
        let a = ExpenseCategory(id: f.rent, name: "Home"), b = ExpenseCategory(id: f.food, name: "Food")
        _ = try f.spend(7_500, f.food, day(2026, 10))
        _ = try f.spend(2_500, f.rent, day(2026, 10))
        _ = try f.ledger.post(kind: .income, date: day(2026, 10), debit: f.bank, credit: f.salary, amountMinor: 20_000, now: now)
        let r = f.ledger.monthReport(ym(2026, 10), expense: [a, b], income: f.incomeCats, calendar: cal)
        #expect(r.categories.map(\.name) == ["Food", "Home"])
        #expect(r.categories.map(\.percent) == [75, 25])
        #expect(r.savedMinor == 10_000)
    }
}
