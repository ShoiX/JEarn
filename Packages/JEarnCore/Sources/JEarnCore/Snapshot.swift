import Foundation

public enum SnapshotError: Error, Equatable {
    case malformed
    case unsupportedSchemaVersion(Int)
    case duplicateId, badSequence, invalidAmount, sameDebitCredit, unknownAccount, badReversal, dateAfterExport
}

/// The JSON backup/export format (docs/spec/backup.md). Reference data reuses the domain types.
public struct Snapshot: Codable, Equatable {
    public static let currentVersion = 1

    public struct EntryRecord: Codable, Equatable {
        public var id: UUID
        public var seq: Int64
        public var kind: EntryKind
        public var date: String  // YYYY-MM-DD
        public var recordedAt: Date
        public var debitId: UUID
        public var creditId: UUID
        public var debitName: String
        public var creditName: String
        public var amountMinor: Int64
        public var note: String
        public var reverses: UUID?
    }

    /// Domain values restored from a validated snapshot.
    public struct Imported: Equatable {
        public let ledger: Ledger
        public let accounts: [Account]
        public let expenseCategories: [ExpenseCategory]
        public let incomeCategories: [IncomeCategory]
        public let currency: Currency
    }

    public var schemaVersion = Snapshot.currentVersion
    public var exportedAt: Date
    public var appVersion: String
    public var currency: String
    public var accounts: [Account]
    public var expenseCategories: [ExpenseCategory]
    public var incomeCategories: [IncomeCategory]
    public var entries: [EntryRecord]

    public static func make(ledger: Ledger, accounts: [Account], expenseCategories: [ExpenseCategory],
                            incomeCategories: [IncomeCategory], currency: Currency,
                            appVersion: String, exportedAt: Date) throws -> Snapshot {
        var names = [openingBalancesID: "Opening Balances"]
        for a in accounts { names[a.id] = a.name }
        for c in expenseCategories { names[c.id] = c.name; for s in c.subs { names[s.id] = s.name } }
        for c in incomeCategories { names[c.id] = c.name }
        let records = try ledger.entries.sorted { $0.seq < $1.seq }.map { e in
            guard let d = names[e.debitID], let c = names[e.creditID] else { throw SnapshotError.unknownAccount }
            return EntryRecord(id: e.id, seq: e.seq, kind: e.kind, date: dayString(e.date), recordedAt: e.recordedAt,
                               debitId: e.debitID, creditId: e.creditID, debitName: d, creditName: c,
                               amountMinor: e.amountMinor, note: e.note, reverses: e.reverses)
        }
        return Snapshot(exportedAt: exportedAt, appVersion: appVersion, currency: currency.code, accounts: accounts,
                        expenseCategories: expenseCategories, incomeCategories: incomeCategories, entries: records)
    }

    /// Pretty-printed JSON with sorted keys and ISO 8601 UTC timestamps.
    public func json() throws -> Data {
        let e = JSONEncoder()
        e.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
        e.dateEncodingStrategy = .iso8601
        return try e.encode(self)
    }

    /// Decodes and validates `data`; rejects the whole file on any failure.
    public static func importData(_ data: Data) throws -> Imported {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        guard let s = try? d.decode(Snapshot.self, from: data) else { throw SnapshotError.malformed }
        return try s.validated()
    }

    private func validated() throws -> Imported {
        guard schemaVersion == Snapshot.currentVersion else { throw SnapshotError.unsupportedSchemaVersion(schemaVersion) }
        guard let cur = Currency.all.first(where: { $0.code == currency }) else { throw SnapshotError.malformed }
        var known: Set<UUID> = [openingBalancesID]
        known.formUnion(accounts.map(\.id))
        for c in expenseCategories { known.insert(c.id); known.formUnion(c.subs.map(\.id)) }
        known.formUnion(incomeCategories.map(\.id))
        // A local date can be up to 14h ahead of UTC, so the export day is the date at UTC+14.
        let lastDay = CalendarDay.today(now: exportedAt, timeZone: TimeZone(secondsFromGMT: 14 * 3600)!)
        var earlier: [UUID: EntryRecord] = [:]
        var reversed: Set<UUID> = []
        var out: [Entry] = []
        for (i, r) in entries.enumerated() {
            guard r.seq == Int64(i + 1) else { throw SnapshotError.badSequence }
            guard earlier[r.id] == nil else { throw SnapshotError.duplicateId }
            guard r.amountMinor > 0 else { throw SnapshotError.invalidAmount }
            guard r.debitId != r.creditId else { throw SnapshotError.sameDebitCredit }
            guard known.contains(r.debitId), known.contains(r.creditId) else { throw SnapshotError.unknownAccount }
            guard let date = Snapshot.parseDay(r.date) else { throw SnapshotError.malformed }
            guard date <= lastDay else { throw SnapshotError.dateAfterExport }
            if r.kind == .reversal {
                guard let t = r.reverses.flatMap({ earlier[$0] }), t.kind != .reversal, reversed.insert(t.id).inserted,
                      r.debitId == t.creditId, r.creditId == t.debitId, r.amountMinor == t.amountMinor, r.date == t.date
                else { throw SnapshotError.badReversal }
            } else if r.reverses != nil {
                throw SnapshotError.badReversal
            }
            earlier[r.id] = r
            out.append(Entry(id: r.id, seq: r.seq, kind: r.kind, date: date, recordedAt: r.recordedAt, debitID: r.debitId,
                             creditID: r.creditId, amountMinor: r.amountMinor, note: r.note, reverses: r.reverses))
        }
        return Imported(ledger: Ledger(entries: out), accounts: accounts, expenseCategories: expenseCategories,
                        incomeCategories: incomeCategories, currency: cur)
    }

    static func dayString(_ date: Date) -> String {
        let c = CalendarDay.utc.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year!, c.month!, c.day!)
    }

    /// Strict "YYYY-MM-DD" to a day stamp; nil for malformed or impossible dates.
    static func parseDay(_ s: String) -> Date? {
        let p = s.split(separator: "-", omittingEmptySubsequences: false)
        guard p.count == 3, p[0].count == 4, p[1].count == 2, p[2].count == 2,
              let y = Int(p[0]), let m = Int(p[1]), let d = Int(p[2]) else { return nil }
        let date = CalendarDay.stamp(year: y, month: m, day: d)
        return dayString(date) == s ? date : nil
    }
}
