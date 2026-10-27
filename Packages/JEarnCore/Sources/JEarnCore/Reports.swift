import Foundation

public struct CategorySpend: Sendable, Equatable {
    public let id: UUID
    public let name: String
    public let spentMinor: Int64
    public let percent: Double  // of total spent, 0...100
}

public struct MonthReport: Sendable, Equatable {
    public let incomeMinor: Int64
    public let spentMinor: Int64
    /// income − spent; negative means shortfall.
    public var savedMinor: Int64 { incomeMinor - spentMinor }
    public let categories: [CategorySpend]  // sorted descending by amount
}

public struct MonthTotals: Sendable, Equatable {
    public let month: YearMonth
    public let incomeMinor: Int64
    public let spentMinor: Int64
}

public struct CategoryAverage: Sendable, Equatable {
    public let id: UUID
    public let name: String
    public let averageMinor: Int64
    public let budgetMinor: Int64  // budget in the current month
    public var isOverBudget: Bool { averageMinor > budgetMinor }
}

public struct SixMonthReport: Sendable, Equatable {
    public let months: [MonthTotals]  // oldest first, last = current month
    public let averageIncomeMinor: Int64  // over the 5 completed months
    public let averageSpentMinor: Int64
    public let categories: [CategoryAverage]
}

extension Ledger {
    public func monthReport(_ month: YearMonth, expense: [ExpenseCategory], income: [IncomeCategory]) -> MonthReport {
        let rows = expense.map { ($0, spent($0, in: month)) }.filter { $0.1 > 0 }
        let total = rows.reduce(0) { $0 + $1.1 }
        let cats = rows
            .sorted { $0.1 != $1.1 ? $0.1 > $1.1 : $0.0.name < $1.0.name }
            .map { CategorySpend(id: $0.0.id, name: $0.0.name, spentMinor: $0.1, percent: Double($0.1) / Double(total) * 100) }
        return MonthReport(incomeMinor: self.income(income, in: month),
                           spentMinor: totalSpent(expense, in: month), categories: cats)
    }

    /// Current month plus the 5 before it; averages cover only the 5 completed months.
    public func sixMonthReport(current: YearMonth, expense: [ExpenseCategory], income: [IncomeCategory]) -> SixMonthReport {
        var months = [current]
        for _ in 0..<5 { months.insert(months[0].previous, at: 0) }
        let totals = months.map {
            MonthTotals(month: $0, incomeMinor: self.income(income, in: $0),
                        spentMinor: totalSpent(expense, in: $0))
        }
        let done = months.dropLast()
        func avg(_ sum: Int64) -> Int64 { Int64((Double(sum) / 5).rounded()) }  // half away from zero
        let cats = expense.map { c in
            CategoryAverage(id: c.id, name: c.name,
                            averageMinor: avg(done.reduce(0) { $0 + spent(c, in: $1) }),
                            budgetMinor: budgetAt(c.budgets, current))
        }
        return SixMonthReport(months: totals,
                              averageIncomeMinor: avg(totals.dropLast().reduce(0) { $0 + $1.incomeMinor }),
                              averageSpentMinor: avg(totals.dropLast().reduce(0) { $0 + $1.spentMinor }),
                              categories: cats)
    }
}
