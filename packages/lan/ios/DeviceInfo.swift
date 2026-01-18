import UIKit

/// Data structure representing device information
struct DeviceInfo {
    let id: String
    let name: String
    
    /// Get device information
    /// - Returns: DeviceInfo with device ID and name
    static func getDeviceInfo() -> DeviceInfo {
        let id = UIDevice.current.identifierForVendor?.uuidString ?? UUID().uuidString
        let name = UIDevice.current.name  // Returns user-defined name like "John's iPhone"
        return DeviceInfo(id: id, name: name)
    }
    
    /// Get device ID
    /// - Returns: Stable device identifier
    static func getDeviceId() -> String {
        return UIDevice.current.identifierForVendor?.uuidString ?? UUID().uuidString
    }
    
    /// Get device name
    /// - Returns: User-defined device name
    static func getDeviceName() -> String {
        return UIDevice.current.name
    }
    
    /// Convert to dictionary for JS bridge
    func toDictionary() -> [String: String] {
        return [
            "id": id,
            "name": name
        ]
    }
}
