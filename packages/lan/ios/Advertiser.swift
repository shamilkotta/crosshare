import Foundation

/// Delegate protocol for advertiser events
protocol AdvertiserDelegate: AnyObject {
    func advertiserDidStart(_ advertiser: Advertiser)
    func advertiser(_ advertiser: Advertiser, didFailWithError code: String, message: String)
}

/// Handles mDNS/Bonjour service advertising
class Advertiser: NSObject {
    
    private static let serviceType = "_crossshare._tcp."
    private static let serviceDomain = "local."
    
    private var netService: NetService?
    private var isAdvertising = false
    
    weak var delegate: AdvertiserDelegate?
    
    /// Start advertising this device
    /// - Parameters:
    ///   - name: Service name to advertise
    ///   - port: Port number the service is running on
    ///   - meta: Optional metadata to include in TXT records
    func startAdvertising(name: String, port: Int, meta: [String: String]?) {
        guard !isAdvertising else { return }
        
        stopAdvertising()
        
        // Create the service
        netService = NetService(
            domain: Self.serviceDomain,
            type: Self.serviceType,
            name: name,
            port: Int32(port)
        )
        
        guard let service = netService else {
            delegate?.advertiser(
                self,
                didFailWithError: "ADVERTISING_FAILED",
                message: "Failed to create NetService"
            )
            return
        }
        
        service.delegate = self
        
        // Build TXT record
        var txtDict: [String: Data] = [:]
        
        // Add standard fields using DeviceInfo
        let deviceInfo = DeviceInfo.getDeviceInfo()
        txtDict["id"] = deviceInfo.id.data(using: .utf8) ?? Data()
        txtDict["deviceName"] = deviceInfo.name.data(using: .utf8) ?? Data()
        txtDict["platform"] = "ios".data(using: .utf8) ?? Data()
        txtDict["version"] = "1".data(using: .utf8) ?? Data()
        
        // Add custom metadata
        if let meta = meta {
            for (key, value) in meta {
                txtDict[key] = value.data(using: .utf8) ?? Data()
            }
        }
        
        let txtData = NetService.data(fromTXTRecord: txtDict)
        service.setTXTRecord(txtData)
        
        // Publish the service
        service.publish()
        isAdvertising = true
    }
    
    /// Stop advertising
    func stopAdvertising() {
        netService?.stop()
        netService?.delegate = nil
        netService = nil
        isAdvertising = false
    }
}

// MARK: - NetServiceDelegate

extension Advertiser: NetServiceDelegate {
    
    func netServiceDidPublish(_ sender: NetService) {
        delegate?.advertiserDidStart(self)
    }
    
    func netService(_ sender: NetService, didNotPublish errorDict: [String: NSNumber]) {
        isAdvertising = false
        
        let errorCode = errorDict[NetService.errorCode]?.intValue ?? -1
        delegate?.advertiser(
            self,
            didFailWithError: "ADVERTISING_FAILED",
            message: "Failed to publish service (error code: \(errorCode))"
        )
    }
    
    func netServiceDidStop(_ sender: NetService) {
        isAdvertising = false
    }
}
