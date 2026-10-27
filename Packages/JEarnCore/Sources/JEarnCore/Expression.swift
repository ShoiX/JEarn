import Foundation

/// Calculator expression evaluator (port of the prototype's `evalExpr`, using Decimal).
/// Supports + - * / × ÷ −, parentheses, unary minus and implicit multiplication before "(".
/// Unclosed "(" auto-close and trailing operators are ignored. Returns nil if invalid or divided by zero.
public func evaluate(_ input: String, currency: Currency) -> Decimal? {
    var chars = Array(input.replacingOccurrences(of: "×", with: "*")
        .replacingOccurrences(of: "÷", with: "/")
        .replacingOccurrences(of: "−", with: "-")
        .filter { !$0.isWhitespace })
    while let last = chars.last, "+-*/".contains(last) { chars.removeLast() }
    var p = Parser(chars: chars)
    guard !chars.isEmpty, let v = p.expr(), p.i == chars.count else { return nil }
    return currency.rounded(v)
}

private struct Parser {
    let chars: [Character]
    var i = 0
    var peek: Character? { i < chars.count ? chars[i] : nil }

    mutating func number() -> Decimal? {
        let start = i
        while let c = peek, c.isASCII, c.isNumber || c == "." { i += 1 }
        let s = String(chars[start..<i])
        guard s.filter({ $0 == "." }).count <= 1, s.contains(where: \.isNumber) else { return nil }
        return Decimal(string: s, locale: Locale(identifier: "en_US_POSIX"))
    }

    mutating func factor() -> Decimal? {
        switch peek {
        case "-": i += 1; return factor().map { -$0 }
        case "(":
            i += 1
            guard let v = expr() else { return nil }
            if peek == ")" { i += 1 }
            return v
        default: return number()
        }
    }

    mutating func term() -> Decimal? {
        guard var v = factor() else { return nil }
        while let c = peek, c == "*" || c == "/" || c == "(" {
            if c != "(" { i += 1 }  // "(" directly after a value is implicit ×
            guard let r = factor() else { return nil }
            if c == "/" {
                if r == 0 { return nil }
                v /= r
            } else {
                v *= r
            }
        }
        return v
    }

    mutating func expr() -> Decimal? {
        guard var v = term() else { return nil }
        while let c = peek, c == "+" || c == "-" {
            i += 1
            guard let r = term() else { return nil }
            v = c == "+" ? v + r : v - r
        }
        return v
    }
}
