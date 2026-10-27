import Foundation

public enum AccountType: String, Sendable, Codable, CaseIterable {
    case bank, savings, credit, cash, investment, loan

    public var accountClass: AccountClass {
        switch self {
        case .bank: .bank
        case .savings: .savings
        case .credit: .credit
        case .cash: .cash
        case .investment: .investment
        case .loan: .loan
        }
    }
}

public struct Account: Sendable, Codable, Equatable, Identifiable {
    public var id: UUID
    public var name: String
    public var type: AccountType
    public var archivedAt: Date?
    public var createdAt: Date
    public var updatedAt: Date
    public init(id: UUID = UUID(), name: String, type: AccountType = .bank,
                archivedAt: Date? = nil, createdAt: Date = Date(), updatedAt: Date = Date()) {
        self.id = id; self.name = name; self.type = type
        self.archivedAt = archivedAt; self.createdAt = createdAt; self.updatedAt = updatedAt
    }
}
