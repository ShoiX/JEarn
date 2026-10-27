import Foundation

public enum EntryKind: String, Sendable, Codable { case expense, income, transfer, opening, reversal }

public enum AccountClass: String, Sendable, Codable {
    case bank, savings, cash, investment  // assets
    case credit, loan                     // liabilities
    case expense, income, equity

    public var isAsset: Bool { [.bank, .savings, .cash, .investment].contains(self) }
    public var isLiability: Bool { self == .credit || self == .loan }
}

/// The built-in equity account "Opening Balances" (fixed id).
public let openingBalancesID = UUID(uuidString: "00000000-0000-0000-0000-0000000000B0")!

public struct Entry: Sendable, Codable, Equatable, Identifiable {
    public let id: UUID
    public let seq: Int64
    public let kind: EntryKind
    public let date: Date
    public let recordedAt: Date
    public let debitID: UUID
    public let creditID: UUID
    public let amountMinor: Int64
    public let note: String
    public let reverses: UUID?
}

public enum LedgerError: Error, Equatable {
    case invalidAmount, sameAccount, reversalNotPostable
    case entryNotFound, alreadyVoided, cannotVoidReversal
    case dateNotCalendarDay, dateInFuture, invalidOpeningClass
}

/// Append-only double-entry ledger. `post` and `void` are the only mutations.
public struct Ledger: Sendable, Codable, Equatable {
    public private(set) var entries: [Entry]

    public init() { entries = [] }

    /// Restores a previously saved ledger.
    public init(entries: [Entry]) { self.entries = entries }

    @discardableResult
    public mutating func post(kind: EntryKind, date: Date, debit: UUID, credit: UUID,
                              amountMinor: Int64, note: String = "", now: Date, timeZone: TimeZone) throws -> Entry {
        guard amountMinor > 0 else { throw LedgerError.invalidAmount }
        guard debit != credit else { throw LedgerError.sameAccount }
        guard kind != .reversal else { throw LedgerError.reversalNotPostable }
        guard CalendarDay.isStamp(date) else { throw LedgerError.dateNotCalendarDay }
        guard date <= CalendarDay.today(now: now, timeZone: timeZone) else { throw LedgerError.dateInFuture }
        return append(kind: kind, date: date, debit: debit, credit: credit, amount: amountMinor, note: note, reverses: nil, now: now)
    }

    /// Posts an opening balance; the direction follows the account class (asset: debit account, liability: credit it).
    @discardableResult
    public mutating func postOpening(account: UUID, class cls: AccountClass, amountMinor: Int64,
                                     date: Date, now: Date, timeZone: TimeZone) throws -> Entry {
        guard cls.isAsset || cls.isLiability else { throw LedgerError.invalidOpeningClass }
        let (debit, credit) = cls.isAsset ? (account, openingBalancesID) : (openingBalancesID, account)
        return try post(kind: .opening, date: date, debit: debit, credit: credit, amountMinor: amountMinor,
                        now: now, timeZone: timeZone)
    }

    /// Posts a reversal of `entryID` (same date and amount, debit/credit swapped).
    @discardableResult
    public mutating func void(entryID: UUID, now: Date) throws -> Entry {
        guard let e = entries.first(where: { $0.id == entryID }) else { throw LedgerError.entryNotFound }
        guard e.kind != .reversal else { throw LedgerError.cannotVoidReversal }
        guard !isVoided(entryID) else { throw LedgerError.alreadyVoided }
        return append(kind: .reversal, date: e.date, debit: e.creditID, credit: e.debitID,
                      amount: e.amountMinor, note: "", reverses: e.id, now: now)
    }

    private mutating func append(kind: EntryKind, date: Date, debit: UUID, credit: UUID, amount: Int64,
                                 note: String, reverses: UUID?, now: Date) -> Entry {
        let e = Entry(id: UUID(), seq: (entries.last?.seq ?? 0) + 1, kind: kind, date: date, recordedAt: now,
                      debitID: debit, creditID: credit, amountMinor: amount, note: note, reverses: reverses)
        entries.append(e)
        return e
    }

    public func isVoided(_ id: UUID) -> Bool { entries.contains { $0.reverses == id } }

    /// Expense/income/transfer entries that are not voided (the Home list).
    public var visibleEntries: [Entry] {
        let voided = Set(entries.compactMap(\.reverses))
        return entries.filter { [.expense, .income, .transfer].contains($0.kind) && !voided.contains($0.id) }
    }

    // MARK: Balances (all time)

    /// Σ debits − Σ credits on the account.
    private func net(_ id: UUID) -> Int64 {
        entries.reduce(0) { $0 + ($1.debitID == id ? $1.amountMinor : 0) - ($1.creditID == id ? $1.amountMinor : 0) }
    }

    /// Asset balance: Σ debits − Σ credits.
    public func assetBalance(_ id: UUID) -> Int64 { net(id) }

    /// Liability balance (amount owed): Σ credits − Σ debits.
    public func liabilityBalance(_ id: UUID) -> Int64 { -net(id) }

    public func balance(of id: UUID, class cls: AccountClass) -> Int64 {
        cls.isLiability ? liabilityBalance(id) : assetBalance(id)
    }

    // MARK: Monthly totals

    /// Σ debits − Σ credits over `ids` for entries dated in `month`. Reversals net out;
    /// transfers and openings never touch expense/income accounts so they are excluded.
    public func monthlyNet(_ ids: Set<UUID>, in month: YearMonth) -> Int64 {
        entries.reduce(0) { sum, e in
            guard YearMonth(e.date) == month else { return sum }
            return sum + (ids.contains(e.debitID) ? e.amountMinor : 0) - (ids.contains(e.creditID) ? e.amountMinor : 0)
        }
    }
}
