import Foundation

// MARK: Reference-data helpers

public protocol Archivable { var archivedAt: Date? { get } }
extension Account: Archivable {}
extension IncomeCategory: Archivable {}
extension ExpenseCategory: Archivable {}
extension SubCategory: Archivable {}

extension Sequence where Element: Archivable {
    /// Non-archived items (what pickers list).
    public var active: [Element] { filter { $0.archivedAt == nil } }
}

extension Sequence where Element == ExpenseCategory {
    /// Non-archived categories, each with only its non-archived subcategories.
    public var pickable: [ExpenseCategory] {
        active.map { var c = $0; c.subs = c.subs.active; return c }
    }
}

public struct SubBudgetOverflow: Sendable, Equatable {
    public let subsTotalMinor: Int64
    public let categoryMinor: Int64
}

extension ExpenseCategory {
    /// Non-nil when the (non-archived) subcategory budgets for `month` add up to more than the category budget.
    public func subBudgetOverflow(in month: YearMonth) -> SubBudgetOverflow? {
        let total = subs.active.reduce(Int64(0)) { $0 + budgetAt($1.budgets, month) }
        let cat = budgetAt(budgets, month)
        return total > cat ? SubBudgetOverflow(subsTotalMinor: total, categoryMinor: cat) : nil
    }
}

extension Ledger {
    /// Currency, sample data and import are only allowed while the ledger is empty.
    public var canChangeCurrency: Bool { entries.isEmpty }
    public var canLoadSampleData: Bool { entries.isEmpty }
    public var canImport: Bool { entries.isEmpty }
}

// MARK: Home list

/// Resolves ids to names (archived items included, so history keeps its names).
public struct Directory: Sendable {
    private var names = [openingBalancesID: "Opening Balances"]
    private var parents: [UUID: String] = [:]  // subcategory id -> category name

    public init(accounts: [Account], expense: [ExpenseCategory], income: [IncomeCategory]) {
        for a in accounts { names[a.id] = a.name }
        for c in expense { names[c.id] = c.name; for s in c.subs { names[s.id] = s.name; parents[s.id] = c.name } }
        for c in income { names[c.id] = c.name }
    }
    public func name(_ id: UUID) -> String { names[id] ?? "" }
    /// The category name for an expense debit id (the id itself if it is a category).
    func categoryName(_ id: UUID) -> String { parents[id] ?? name(id) }
}

public enum AmountKind: Sendable, Equatable { case expense, income, transfer }

public struct HomeRow: Sendable, Equatable, Identifiable {
    public let id: UUID
    public let title: String
    public let meta: String
    public let kind: AmountKind
    public let amountText: String
}

public struct DaySection: Sendable, Equatable {
    public let date: Date
    public let label: String
    public let rows: [HomeRow]
}

private let weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
private let months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/// "Today", "Yesterday", otherwise "EEE d MMM" in English.
public func dayLabel(_ date: Date, today: Date) -> String {
    if date == today { return "Today" }
    if date == today.addingTimeInterval(-86_400) { return "Yesterday" }
    let c = CalendarDay.utc.dateComponents([.weekday, .day, .month], from: date)
    return "\(weekdays[c.weekday! - 1]) \(c.day!) \(months[c.month! - 1])"
}

extension Ledger {
    /// The month's visible entries grouped by day, newest first (date desc, then seq desc).
    public func homeSections(month: YearMonth, directory dir: Directory, today: Date, currency: Currency) -> [DaySection] {
        let list = visibleEntries.filter { YearMonth($0.date) == month }
            .sorted { $0.date != $1.date ? $0.date > $1.date : $0.seq > $1.seq }
        return Dictionary(grouping: list, by: \.date).map { date, es in
            DaySection(date: date, label: dayLabel(date, today: today), rows: es.map { row($0, dir, currency) })
        }.sorted { $0.date > $1.date }
    }

    private func row(_ e: Entry, _ dir: Directory, _ currency: Currency) -> HomeRow {
        func join(_ parts: [String]) -> String { parts.filter { !$0.isEmpty }.joined(separator: " \u{00B7} ") }
        switch e.kind {
        case .income:
            return HomeRow(id: e.id, title: dir.name(e.creditID), meta: join([dir.name(e.debitID), e.note]),
                           kind: .income, amountText: currency.format(e.amountMinor, sign: .plus))
        case .transfer:
            return HomeRow(id: e.id, title: "Transfer", meta: "\(dir.name(e.creditID)) \u{2192} \(dir.name(e.debitID))",
                           kind: .transfer, amountText: currency.format(e.amountMinor))
        default:
            return HomeRow(id: e.id, title: dir.name(e.debitID),
                           meta: join([dir.categoryName(e.debitID), dir.name(e.creditID), e.note]),
                           kind: .expense, amountText: currency.format(e.amountMinor, sign: .minus))
        }
    }
}

// MARK: Add Transaction draft

public enum TxType: Sendable, Equatable { case expense, income, transfer }

public enum DraftError: Error, Equatable { case invalidAmount, missingAccount, sameAccount, dateInFuture, missingCategory }

public struct TransactionDraft: Sendable, Equatable {
    public var type: TxType
    public var expression = ""
    public var accountId: UUID?
    public var toAccountId: UUID?
    public var date: Date
    public var note = ""
    /// Expense category or income category, depending on `type`.
    public var categoryId: UUID?
    public var subcategoryId: UUID?

    public init(type: TxType = .expense, accountId: UUID? = nil, toAccountId: UUID? = nil, date: Date) {
        self.type = type; self.accountId = accountId; self.toAccountId = toAccountId; self.date = date
    }

    public func validate(currency: Currency, now: Date, timeZone: TimeZone) throws {
        guard liveAmount(expression, currency: currency) > 0 else { throw DraftError.invalidAmount }
        guard accountId != nil, type != .transfer || toAccountId != nil else { throw DraftError.missingAccount }
        if type == .transfer, accountId == toAccountId { throw DraftError.sameAccount }
        guard date <= CalendarDay.today(now: now, timeZone: timeZone) else { throw DraftError.dateInFuture }
        switch type {
        case .expense: guard categoryId != nil || subcategoryId != nil else { throw DraftError.missingCategory }
        case .income: guard categoryId != nil else { throw DraftError.missingCategory }
        case .transfer: break
        }
    }

    public func isValid(currency: Currency, now: Date, timeZone: TimeZone) -> Bool {
        (try? validate(currency: currency, now: now, timeZone: timeZone)) != nil
    }

    /// Validates, then posts with the debit/credit mapping from ledger.md.
    @discardableResult
    public func post(into ledger: inout Ledger, currency: Currency, now: Date, timeZone: TimeZone) throws -> Entry {
        try validate(currency: currency, now: now, timeZone: timeZone)
        let (account, amount) = (accountId!, currency.minorUnits(liveAmount(expression, currency: currency)))
        let (kind, debit, credit): (EntryKind, UUID, UUID) = switch type {
        case .expense: (.expense, subcategoryId ?? categoryId!, account)
        case .income: (.income, account, categoryId!)
        case .transfer: (.transfer, toAccountId!, account)
        }
        return try ledger.post(kind: kind, date: date, debit: debit, credit: credit, amountMinor: amount,
                               note: note.trimmingCharacters(in: .whitespacesAndNewlines), now: now, timeZone: timeZone)
    }
}
