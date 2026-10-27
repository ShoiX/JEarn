import Foundation

public enum Key: Hashable, Sendable {
    case digit(Int), dot, plus, minus, times, divide, open, close, clear, backspace, equals
}

private let operators: Set<Character> = ["+", "-", "*", "/"]
private let separators: Set<Character> = ["+", "-", "*", "/", "(", ")"]

/// Pure keypad handler (port of the prototype's `press`). Returns `current` unchanged when the key is rejected.
public func pressKey(_ current: String, _ key: Key, currency: Currency) -> String {
    var v = current
    let last = v.last
    let seg = String(v.reversed().prefix { !separators.contains($0) }.reversed())
    switch key {
    case .backspace: v = String(v.dropLast())
    case .clear: v = ""
    case .equals:
        guard let r = evaluate(v, currency: currency) else { return current }
        v = r > 0 ? "\(r)" : ""
    case .plus, .minus, .times, .divide:
        let op: Character = [.plus: "+", .minus: "-", .times: "*", .divide: "/"][key]!
        if v.isEmpty && op != "-" { return current }
        if last == "(" && op != "-" { return current }
        if let l = last, operators.contains(l) { v.removeLast() }
        v.append(op)
    case .open:
        if let l = last, l.isNumber || l == "." || l == ")" { v.append("*") }
        v.append("(")
    case .close:
        let open = v.filter { $0 == "(" }.count - v.filter { $0 == ")" }.count
        guard open > 0, let l = last, !operators.contains(l), l != "(" else { return current }
        v.append(")")
    case .dot:
        guard currency.minorDigits > 0, !seg.contains(".") else { return current }
        if last == ")" { v.append("*") }
        v += seg.isEmpty ? "0." : "."
    case .digit(let n):
        if let dot = seg.firstIndex(of: "."), seg[seg.index(after: dot)...].count >= currency.minorDigits { return current }
        if seg.filter({ $0 != "." }).count >= 7 { return current }
        if last == ")" { v.append("*") }
        if seg == "0" { v.removeLast() }
        v += String(n)
    }
    return v.count > 32 ? current : v
}

/// Live amount: trailing operators and "(" are ignored; only values > 0 count, otherwise 0.
public func liveAmount(_ expression: String, currency: Currency) -> Decimal {
    var e = expression
    while let l = e.last, operators.contains(l) || l == "(" { e.removeLast() }
    if let r = evaluate(e, currency: currency), r > 0 { return r }
    return 0
}

/// Turning the calculator off evaluates any expression into a plain amount ("" if not > 0).
public func calculatorOff(_ expression: String, currency: Currency) -> String {
    guard expression.contains(where: separators.contains) else { return expression }
    let r = liveAmount(expression, currency: currency)
    return r > 0 ? "\(r)" : ""
}
