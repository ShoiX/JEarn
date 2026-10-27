import Foundation

/// Calendar days are time-zone independent: stored as 00:00 UTC. Only "today" uses a local time zone.
public enum CalendarDay {
    /// Fixed UTC Gregorian calendar used for all day/month bucketing.
    static let utc: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "UTC")!
        return c
    }()

    public static func stamp(year: Int, month: Int, day: Int) -> Date {
        utc.date(from: DateComponents(year: year, month: month, day: day))!
    }

    /// The local date at `now` in `timeZone`, stamped as UTC midnight.
    public static func today(now: Date, timeZone: TimeZone) -> Date {
        var local = Calendar(identifier: .gregorian)
        local.timeZone = timeZone
        let c = local.dateComponents([.year, .month, .day], from: now)
        return stamp(year: c.year!, month: c.month!, day: c.day!)
    }

    public static func isStamp(_ date: Date) -> Bool {
        date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: 86_400) == 0
    }
}
