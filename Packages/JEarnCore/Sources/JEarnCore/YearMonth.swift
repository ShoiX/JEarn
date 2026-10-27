import Foundation

public struct YearMonth: Sendable, Codable, Hashable, Comparable, CustomStringConvertible {
    public let year: Int
    public let month: Int  // 1...12

    public init(year: Int, month: Int) {
        self.year = year
        self.month = month
    }

    /// The month containing `date` in the calendar's time zone.
    public init(_ date: Date, calendar: Calendar) {
        let c = calendar.dateComponents([.year, .month], from: date)
        self.init(year: c.year!, month: c.month!)
    }

    /// Parses "YYYY-MM".
    public init?(_ string: String) {
        let parts = string.split(separator: "-", omittingEmptySubsequences: false)
        guard parts.count == 2, parts[0].count == 4, parts[1].count == 2,
              let y = Int(parts[0]), let m = Int(parts[1]), (1...12).contains(m) else { return nil }
        self.init(year: y, month: m)
    }

    public var next: YearMonth { month == 12 ? .init(year: year + 1, month: 1) : .init(year: year, month: month + 1) }
    public var previous: YearMonth { month == 1 ? .init(year: year - 1, month: 12) : .init(year: year, month: month - 1) }

    public static func < (a: YearMonth, b: YearMonth) -> Bool { (a.year, a.month) < (b.year, b.month) }

    public var description: String { String(format: "%04d-%02d", year, month) }
}
