import Foundation
@testable import JEarnCore

let utc = TimeZone(identifier: "UTC")!
func day(_ y: Int, _ m: Int, _ d: Int = 10) -> Date { CalendarDay.stamp(year: y, month: m, day: d) }
func ym(_ y: Int, _ m: Int) -> YearMonth { YearMonth(year: y, month: m) }
let now = day(2026, 10, 27)
