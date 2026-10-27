import Testing
import Foundation
@testable import JEarnCore

private func keys(_ s: String) -> [Key] {
    s.map { ch -> Key in
        switch ch {
        case "0"..."9": .digit(Int(String(ch))!)
        case ".": .dot
        case "+": .plus
        case "-": .minus
        case "*": .times
        case "/": .divide
        case "(": .open
        case ")": .close
        case "C": .clear
        case "<": .backspace
        default: .equals  // "="
        }
    }
}
private func press(_ s: String, from start: String = "", _ c: Currency = .aud) -> String {
    keys(s).reduce(start) { pressKey($0, $1, currency: c) }
}

@Suite struct AmountInputTests {
    @Test func digitsAndLeadingZero() {
        #expect(press("123") == "123")
        #expect(press("007") == "7")
        #expect(press("0.05") == "0.05")
    }
    @Test func maxDecimalsFollowCurrency() {
        #expect(press("1.234") == "1.23")
        #expect(press("1.5", .jpy) == "15")  // "." ignored: no minor digits
        #expect(press("12", .jpy) == "12")
    }
    @Test func sevenDigitsPerNumber() {
        #expect(press("12345678") == "1234567")
        #expect(press("1234567+89") == "1234567+89")
        #expect(press("12345.678") == "12345.67")  // digits counted across the decimal point
    }
    @Test func lengthCap() {
        let s = "1+1+1+1+1+1+1+1+1+1+1+1+1+1+1+1"  // 31 chars
        #expect(s.count == 31)
        #expect(press("1", from: s) == s + "1")
        #expect(press("+", from: s + "1") == s + "1")  // would be 33
        #expect(press("+", from: s) == s + "+")  // 32 is allowed
    }
    @Test func dotOnEmptySegment() {
        #expect(press(".") == "0.")
        #expect(press("5+.") == "5+0.")
        #expect(press("(.") == "(0.")
        #expect(press("1.5.") == "1.5")
        #expect(press("(2).") == "(2)*0.")
    }
    @Test func operators() {
        #expect(press("+") == "")           // not on empty
        #expect(press("-") == "-")          // minus is allowed first
        #expect(press("5+") == "5+")
        #expect(press("5+*") == "5*")       // replacement
        #expect(press("5*-") == "5-")
        #expect(press("(+") == "(")         // not right after "("
        #expect(press("(-") == "(-")
    }
    @Test func parentheses() {
        #expect(press("2(") == "2*(")
        #expect(press("(2)(") == "(2)*(")
        #expect(press("2+(") == "2+(")
        #expect(press("(") == "(")
        #expect(press("2.(") == "2.*(")
        #expect(press(")") == "")
        #expect(press("(2+3)") == "(2+3)")
        #expect(press("(2+3))") == "(2+3)")
        #expect(press("(2+)") == "(2+")
        #expect(press("()") == "(")
        #expect(press("(2)3") == "(2)*3")
    }
    @Test func clearAndBackspace() {
        #expect(press("12+3C") == "")
        #expect(press("12+<") == "12")
        #expect(press("<") == "")
    }
    @Test func equals() {
        #expect(press("(12+3)*2=") == "30")
        #expect(press("10/4=") == "2.5")
        #expect(press("1/3=") == "0.33")
        #expect(press("5-9=") == "")      // keeps only results > 0
        #expect(press("5-5=") == "")
        #expect(press("5/0=") == "5/0")   // invalid: unchanged
        #expect(press("(2+3=") == "5")    // unclosed parenthesis auto-closes
    }
    @Test func liveAmountIgnoresTrailing() {
        #expect(liveAmount("5+", currency: .aud) == 5)
        #expect(liveAmount("5+(", currency: .aud) == 5)
        #expect(liveAmount("2*(3+", currency: .aud) == 6)
        #expect(liveAmount("5-9", currency: .aud) == 0)
        #expect(liveAmount("", currency: .aud) == 0)
        #expect(liveAmount("+", currency: .aud) == 0)
        #expect(liveAmount("1.005", currency: .aud) == Decimal(string: "1.01"))
    }
    @Test func calculatorOffEvaluates() {
        #expect(calculatorOff("(12+3)*2", currency: .aud) == "30")
        #expect(calculatorOff("5+", currency: .aud) == "5")
        #expect(calculatorOff("5-9", currency: .aud) == "")
        #expect(calculatorOff("12.5", currency: .aud) == "12.5")
        #expect(calculatorOff("", currency: .aud) == "")
    }
}
