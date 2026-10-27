import Testing
import Foundation
@testable import JEarnCore

private let sydney = TimeZone(secondsFromGMT: 11 * 3600)!
private let kiritimati = TimeZone(secondsFromGMT: 14 * 3600)!
private func instant(_ iso: String) -> Date { ISO8601DateFormatter().date(from: iso)! }

@Suite struct CalendarDayTests {
    @Test func stampIsUTCMidnight() {
        #expect(CalendarDay.stamp(year: 2026, month: 10, day: 31) == instant("2026-10-31T00:00:00Z"))
    }
    @Test func todayUsesLocalDate() {
        let n = instant("2026-10-30T14:00:00Z")  // 01:00 on 31 Oct in UTC+11
        #expect(CalendarDay.today(now: n, timeZone: sydney) == day(2026, 10, 31))
        #expect(CalendarDay.today(now: n, timeZone: utc) == day(2026, 10, 30))
    }
    @Test func isStamp() {
        #expect(CalendarDay.isStamp(day(2026, 10, 31)))
        #expect(!CalendarDay.isStamp(day(2026, 10, 31).addingTimeInterval(3600)))
        #expect(!CalendarDay.isStamp(day(2026, 10, 31).addingTimeInterval(0.5)))
    }
    @Test func monthBucketingIsUTC() {
        #expect(YearMonth(day(2026, 10, 31)) == ym(2026, 10))
        #expect(YearMonth(day(2026, 11, 1)) == ym(2026, 11))
    }
}

@Suite struct PostDateTests {
    @Test func rejectsNonStampDate() {
        var l = Ledger()
        let d = day(2026, 10, 20).addingTimeInterval(12 * 3600)
        #expect(throws: LedgerError.dateNotCalendarDay) {
            try l.post(kind: .expense, date: d, debit: UUID(), credit: UUID(), amountMinor: 5, now: now, timeZone: utc)
        }
        #expect(l.entries.isEmpty)
    }
    @Test func rejectsFutureDate() {
        var l = Ledger()
        #expect(throws: LedgerError.dateInFuture) {
            try l.post(kind: .expense, date: day(2026, 10, 28), debit: UUID(), credit: UUID(), amountMinor: 5, now: now, timeZone: utc)
        }
    }
    @Test func october31StaysInOctoberInUTCPlus11() throws {
        var l = Ledger()
        let cat = UUID()
        let n = instant("2026-10-30T14:00:00Z")  // 31 Oct 01:00 local
        try l.post(kind: .expense, date: day(2026, 10, 31), debit: cat, credit: UUID(), amountMinor: 5, now: n, timeZone: sydney)
        #expect(l.monthlyNet([cat], in: ym(2026, 10)) == 5)
        #expect(l.monthlyNet([cat], in: ym(2026, 11)) == 0)
    }
    @Test func todayInUTCPlus14Accepted() throws {
        var l = Ledger()
        let n = instant("2026-10-26T10:30:00Z")  // 27 Oct 00:30 local, still 26 Oct in UTC
        try l.post(kind: .expense, date: day(2026, 10, 27), debit: UUID(), credit: UUID(), amountMinor: 5, now: n, timeZone: kiritimati)
        #expect(l.entries.count == 1)
        #expect(throws: LedgerError.dateInFuture) {
            try l.post(kind: .expense, date: day(2026, 10, 27), debit: UUID(), credit: UUID(), amountMinor: 5, now: n, timeZone: utc)
        }
    }
}

@Suite struct OpeningTests {
    @Test func assetAndLiabilityBalancesReadCorrectly() throws {
        var l = Ledger()
        let bank = UUID(), card = UUID()
        let a = try l.postOpening(account: bank, class: .bank, amountMinor: 100_000, date: now, now: now, timeZone: utc)
        let b = try l.postOpening(account: card, class: .credit, amountMinor: 30_000, date: now, now: now, timeZone: utc)
        #expect(a.kind == .opening && a.debitID == bank && a.creditID == openingBalancesID)
        #expect(b.kind == .opening && b.debitID == openingBalancesID && b.creditID == card)
        #expect(l.balance(of: bank, class: .bank) == 100_000)
        #expect(l.balance(of: card, class: .credit) == 30_000)
    }
    @Test func rejectsNonAccountClasses() {
        var l = Ledger()
        for c in [AccountClass.expense, .income, .equity] {
            #expect(throws: LedgerError.invalidOpeningClass) {
                try l.postOpening(account: UUID(), class: c, amountMinor: 5, date: now, now: now, timeZone: utc)
            }
        }
    }
    @Test func validatesLikePost() {
        var l = Ledger()
        #expect(throws: LedgerError.invalidAmount) {
            try l.postOpening(account: UUID(), class: .cash, amountMinor: 0, date: now, now: now, timeZone: utc)
        }
        #expect(throws: LedgerError.dateInFuture) {
            try l.postOpening(account: UUID(), class: .cash, amountMinor: 1, date: day(2027, 1, 1), now: now, timeZone: utc)
        }
    }
}
