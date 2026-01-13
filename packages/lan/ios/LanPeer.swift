import Foundation

/// Data model representing a discovered LAN peer
struct LanPeer {
    let id: String
    let name: String
    let host: String
    let port: Int
    let platform: String
    let meta: [String: String]?
    
    /// Convert to dictionary for JS bridge
    func toDictionary() -> [String: Any] {
        var dict: [String: Any] = [
            "id": id,
            "name": name,
            "host": host,
            "port": port,
            "platform": platform
        ]
        if let meta = meta {
            dict["meta"] = meta
        }
        return dict
    }
}
