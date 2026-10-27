import Testing
import Foundation
@testable import JEarnCore

@Suite struct MoneyFormatTests {
    @Test func variants() {
        #expect(Currency.aud.format(1250) == "$12.50")
        #expect(Currency.aud.format(1250, sign: .plus) == "+$12.50")
        #expect(Currency.aud.format(1250, sign: .minus) == "\u{2212}$12.50")
        #expect(Currency.aud.format(-1250, sign: .minus) == "\u{2212}$12.50")  // sign style uses the magnitude
        #expect(Currency.aud.format(-1250) == "\u{2212}$12.50")
    }
    @Test func digitsAndSeparators() {
        #expect(Currency.aud.format(0) == "$0.00")
        #expect(Currency.aud.format(5) == "$0.05")
        #expect(Currency.aud.format(100_000) == "$1,000.00")
        #expect(Currency.aud.format(123_456_789) == "$1,234,567.89")
        #expect(Currency.jpy.format(1_500) == "\u{00A5}1,500")
        #expect(Currency.jpy.format(7, sign: .plus) == "+\u{00A5}7")
        #expect(Currency.aud.format(Int64.min) == "\u{2212}$92,233,720,368,547,758.08")
    }
    @Test func symbols() {
        let expected = ["AUD": "$", "USD": "$", "NZD": "$", "CAD": "$", "SGD": "$", "EUR": "\u{20AC}",
                        "GBP": "\u{00A3}", "JPY": "\u{00A5}", "INR": "\u{20B9}", "PHP": "\u{20B1}"]
        for c in Currency.all { #expect(c.format(100).hasPrefix(expected[c.code]!), "\(c.code)") }
    }
    @Test func phpDefaultAndOrder() {
        #expect(Currency.php.code == "PHP")
        #expect(Currency.php.minorDigits == 2)
        #expect(Currency.default == .php)
        #expect(Currency.all.map(\.code) == ["PHP", "AUD", "USD", "EUR", "GBP", "NZD", "CAD", "SGD", "JPY", "INR"])
        #expect(Currency.php.format(123_456, sign: .none) == "\u{20B1}1,234.56")
    }
}
