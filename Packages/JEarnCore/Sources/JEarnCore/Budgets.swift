import Foundation

public struct BudgetEntry: Sendable, Codable, Equatable {
    public var from: YearMonth
    public var amountMinor: Int64
    public init(from: YearMonth, amountMinor: Int64) { self.from = from; self.amountMinor = amountMinor }
}

/// Latest entry with from <= month; if none, the earliest entry; no entries -> 0.
public func budgetAt(_ budgets: [BudgetEntry], _ month: YearMonth) -> Int64 {
    let sorted = budgets.sorted { $0.from < $1.from }
    guard var v = sorted.first?.amountMinor else { return 0 }
    for e in sorted where e.from <= month { v = e.amountMinor }
    return v
}

/// Removes entries with from >= month and adds {month, amount}: applies to `month` onward only.
public func setBudget(_ budgets: [BudgetEntry], from month: YearMonth, amountMinor: Int64) -> [BudgetEntry] {
    budgets.filter { $0.from < month } + [BudgetEntry(from: month, amountMinor: amountMinor)]
}

// Reference data, mirroring ledger.md.
public struct SubCategory: Sendable, Codable, Equatable, Identifiable {
    public var id: UUID
    public var name: String
    public var budgets: [BudgetEntry]
    public init(id: UUID = UUID(), name: String, budgets: [BudgetEntry] = []) {
        self.id = id; self.name = name; self.budgets = budgets
    }
}

public struct ExpenseCategory: Sendable, Codable, Equatable, Identifiable {
    public var id: UUID
    public var name: String
    public var budgets: [BudgetEntry]
    public var rollover: Bool
    public var rollStart: YearMonth?
    public var subs: [SubCategory]
    public init(id: UUID = UUID(), name: String, budgets: [BudgetEntry] = [], rollover: Bool = false,
                rollStart: YearMonth? = nil, subs: [SubCategory] = []) {
        self.id = id; self.name = name; self.budgets = budgets
        self.rollover = rollover; self.rollStart = rollStart; self.subs = subs
    }
    /// The category's own id plus its subcategories' ids (entries may debit either).
    var accountIDs: Set<UUID> { Set(subs.map(\.id)).union([id]) }
}

public struct IncomeCategory: Sendable, Codable, Equatable, Identifiable {
    public var id: UUID
    public var name: String
    public init(id: UUID = UUID(), name: String) { self.id = id; self.name = name }
}

// MARK: Monthly aggregates, rollover

extension Ledger {
    /// Spent in an expense category (incl. subcategories) for the month.
    public func spent(_ cat: ExpenseCategory, in month: YearMonth, calendar: Calendar) -> Int64 {
        monthlyNet(cat.accountIDs, in: month, calendar: calendar)
    }

    public func spent(_ sub: SubCategory, in month: YearMonth, calendar: Calendar) -> Int64 {
        monthlyNet([sub.id], in: month, calendar: calendar)
    }

    /// Income for the month: credits − debits on income accounts.
    public func income(_ cats: [IncomeCategory], in month: YearMonth, calendar: Calendar) -> Int64 {
        -monthlyNet(Set(cats.map(\.id)), in: month, calendar: calendar)
    }

    /// Total spent across all expense categories for the month.
    public func totalSpent(_ cats: [ExpenseCategory], in month: YearMonth, calendar: Calendar) -> Int64 {
        cats.reduce(0) { $0 + spent($1, in: month, calendar: calendar) }
    }

    /// Accumulated (budget − spent) from rollStart up to month−1; 0 if rollover is off.
    public func carryover(_ cat: ExpenseCategory, to month: YearMonth, calendar: Calendar) -> Int64 {
        guard cat.rollover, var m = cat.rollStart else { return 0 }
        var carry: Int64 = 0
        var guardCount = 0
        while m < month, guardCount < 600 {
            carry += budgetAt(cat.budgets, m) - spent(cat, in: m, calendar: calendar)
            m = m.next
            guardCount += 1
        }
        return carry
    }

    /// Available = budget + carryover.
    public func available(_ cat: ExpenseCategory, in month: YearMonth, calendar: Calendar) -> Int64 {
        budgetAt(cat.budgets, month) + carryover(cat, to: month, calendar: calendar)
    }

    /// Left to spend = total available − month expenses.
    public func leftToSpend(_ cats: [ExpenseCategory], in month: YearMonth, calendar: Calendar) -> Int64 {
        cats.reduce(0) { $0 + available($1, in: month, calendar: calendar) } - totalSpent(cats, in: month, calendar: calendar)
    }
}
