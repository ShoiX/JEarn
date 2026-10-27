import SwiftUI
import JEarnCore

struct ContentView: View {
    private var result: String {
        if let value = evaluate("(12+3)×2", currency: .aud) {
            return "(12+3)×2 = \(value)"
        }
        return "(12+3)×2 = error"
    }

    var body: some View {
        ZStack {
            Color(red: 22 / 255, green: 24 / 255, blue: 38 / 255)
                .ignoresSafeArea()
            VStack(spacing: 12) {
                Text("JEarn")
                    .font(.largeTitle.bold())
                    .foregroundStyle(Color(red: 233 / 255, green: 233 / 255, blue: 237 / 255))
                Text(result)
                    .font(.body)
                    .foregroundStyle(Color(red: 233 / 255, green: 233 / 255, blue: 237 / 255))
            }
        }
    }
}
