import Foundation

/// ISO 4217 currency with its number of minor digits. Money is stored as Int64 minor units.
public struct Currency: Sendable, Codable, Equatable {
    public let code: String
    public let minorDigits: Int

    public init(code: String, minorDigits: Int) {
        self.code = code
        self.minorDigits = minorDigits
    }

    public static let aud = Currency(code: "AUD", minorDigits: 2)
    public static let jpy = Currency(code: "JPY", minorDigits: 0)

    /// Supported currencies: JPY has 0 minor digits, the rest 2.
    public static let all: [Currency] =
        ["AUD", "USD", "EUR", "GBP", "NZD", "CAD", "SGD", "INR", "PHP"].map { Currency(code: $0, minorDigits: 2) }
        + [.jpy]

    /// Rounds to this currency's minor digits, half away from zero.
    public func rounded(_ value: Decimal) -> Decimal {
        var v = value, r = Decimal()
        NSDecimalRound(&r, &v, minorDigits, .plain)
        return r
    }

    /// Converts a decimal amount to Int64 minor units, half away from zero.
    public func minorUnits(_ value: Decimal) -> Int64 {
        var shifted = rounded(value)
        shifted *= pow(10, minorDigits)
        return NSDecimalNumber(decimal: shifted).int64Value
    }

    /// Minor units back to a Decimal (for display).
    public func decimal(minor: Int64) -> Decimal {
        Decimal(minor) / pow(10, minorDigits)
    }
}
