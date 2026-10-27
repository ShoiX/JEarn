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

public enum MoneySign: Sendable { case none, plus, minus }

extension Currency {
    public var symbol: String {
        switch code {
        case "EUR": "\u{20AC}"
        case "GBP": "\u{00A3}"
        case "JPY": "\u{00A5}"
        case "INR": "\u{20B9}"
        case "PHP": "\u{20B1}"
        default: "$"
        }
    }

    /// "$1,234.50". `.plus`/`.minus` show the magnitude with "+"/"−" (U+2212); `.none` shows "−" only if negative.
    /// Not NumberFormatter: its output differs across platforms.
    public func format(_ minor: Int64, sign: MoneySign = .none) -> String {
        let mag = minor.magnitude
        let scale = (0..<minorDigits).reduce(UInt64(1)) { r, _ in r * 10 }
        var whole = String(mag / scale)
        var i = whole.count - 3
        while i > 0 { whole.insert(",", at: whole.index(whole.startIndex, offsetBy: i)); i -= 3 }
        var frac = ""
        if minorDigits > 0 {
            let f = String(mag % scale)
            frac = "." + String(repeating: "0", count: minorDigits - f.count) + f
        }
        let prefix = switch sign { case .plus: "+"; case .minus: "\u{2212}"; case .none: minor < 0 ? "\u{2212}" : "" }
        return prefix + symbol + whole + frac
    }
}
