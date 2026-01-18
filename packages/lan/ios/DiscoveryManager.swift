import Foundation

/// Delegate protocol for discovery events
protocol DiscoveryManagerDelegate: AnyObject {
    func discoveryManager(_ manager: DiscoveryManager, didFindPeer peer: LanPeer)
    func discoveryManager(_ manager: DiscoveryManager, didLosePeer peerId: String)
    func discoveryManager(_ manager: DiscoveryManager, didFailWithError code: String, message: String)
}

/// Handles mDNS/Bonjour service discovery
class DiscoveryManager: NSObject {
    
    private static let serviceType = "_crossshare._tcp."
    private static let serviceDomain = "local."
    
    private var serviceBrowser: NetServiceBrowser?
    private var discoveredServices: [String: NetService] = [:]
    private var resolvedPeers: [String: LanPeer] = [:]
    private var resolvingServices: Set<NetService> = []
    
    weak var delegate: DiscoveryManagerDelegate?
    
    private var isDiscovering = false
    
    /// Start discovering nearby Crossshare devices
    func startDiscovery() {
        guard !isDiscovering else { return }
        
        stopDiscovery()
        
        serviceBrowser = NetServiceBrowser()
        serviceBrowser?.delegate = self
        serviceBrowser?.searchForServices(ofType: Self.serviceType, inDomain: Self.serviceDomain)
        isDiscovering = true
    }
    
    /// Stop discovery
    func stopDiscovery() {
        serviceBrowser?.stop()
        serviceBrowser?.delegate = nil
        serviceBrowser = nil
        
        // Stop resolving any pending services
        for service in resolvingServices {
            service.stop()
            service.delegate = nil
        }
        resolvingServices.removeAll()
        
        discoveredServices.removeAll()
        resolvedPeers.removeAll()
        isDiscovering = false
    }
    
    /// Get current list of discovered peers
    func getDiscoveredPeers() -> [LanPeer] {
        return Array(resolvedPeers.values)
    }
    
    /// Generate a unique ID for a service
    private func serviceId(for service: NetService) -> String {
        return "\(service.name).\(service.type)\(service.domain)"
    }
    
    /// Parse TXT record data into dictionary
    private func parseTXTRecord(_ data: Data?) -> [String: String] {
        guard let data = data else { return [:] }
        let dict = NetService.dictionary(fromTXTRecord: data)
        var result: [String: String] = [:]
        for (key, value) in dict {
            if let stringValue = String(data: value, encoding: .utf8) {
                result[key] = stringValue
            }
        }
        return result
    }
}

// MARK: - NetServiceBrowserDelegate

extension DiscoveryManager: NetServiceBrowserDelegate {
    
    func netServiceBrowser(_ browser: NetServiceBrowser, didFind service: NetService, moreComing: Bool) {
        let id = serviceId(for: service)
        discoveredServices[id] = service
        
        // Start resolving to get IP and port
        service.delegate = self
        resolvingServices.insert(service)
        service.resolve(withTimeout: 10.0)
    }
    
    func netServiceBrowser(_ browser: NetServiceBrowser, didRemove service: NetService, moreComing: Bool) {
        let id = serviceId(for: service)
        discoveredServices.removeValue(forKey: id)
        
        if let peer = resolvedPeers.removeValue(forKey: id) {
            delegate?.discoveryManager(self, didLosePeer: peer.id)
        }
        
        resolvingServices.remove(service)
        service.stop()
        service.delegate = nil
    }
    
    func netServiceBrowser(_ browser: NetServiceBrowser, didNotSearch errorDict: [String: NSNumber]) {
        let errorCode = errorDict[NetService.errorCode]?.intValue ?? -1
        delegate?.discoveryManager(
            self,
            didFailWithError: "DISCOVERY_FAILED",
            message: "Failed to start discovery (error code: \(errorCode))"
        )
    }
    
    func netServiceBrowserDidStopSearch(_ browser: NetServiceBrowser) {
        isDiscovering = false
    }
}

// MARK: - NetServiceDelegate

extension DiscoveryManager: NetServiceDelegate {
    
    func netServiceDidResolveAddress(_ sender: NetService) {
        resolvingServices.remove(sender)
        
        guard let addresses = sender.addresses, !addresses.isEmpty else {
            return
        }
        
        // Extract IP address from first available address
        var hostname: String?
        for addressData in addresses {
            var addr = sockaddr()
            (addressData as NSData).getBytes(&addr, length: MemoryLayout<sockaddr>.size)
            
            if addr.sa_family == UInt8(AF_INET) {
                var addr4 = sockaddr_in()
                (addressData as NSData).getBytes(&addr4, length: MemoryLayout<sockaddr_in>.size)
                if let ip = String(cString: inet_ntoa(addr4.sin_addr), encoding: .ascii) {
                    hostname = ip
                    break
                }
            }
        }
        
        guard let host = hostname else { return }
        
        let txtRecord = parseTXTRecord(sender.txtRecordData())
        let id = serviceId(for: sender)
        
        // Extract metadata
        let peerId = txtRecord["id"] ?? id
        let platform = txtRecord["platform"] ?? "ios"
        // Use deviceName from TXT record, fallback to service name
        let deviceName = txtRecord["deviceName"] ?? sender.name
        
        // Remove standard keys from meta
        var meta = txtRecord
        meta.removeValue(forKey: "id")
        meta.removeValue(forKey: "platform")
        meta.removeValue(forKey: "version")
        meta.removeValue(forKey: "deviceName")
        
        let peer = LanPeer(
            id: peerId,
            name: deviceName,
            host: host,
            port: sender.port,
            platform: platform,
            meta: meta.isEmpty ? nil : meta
        )
        
        resolvedPeers[id] = peer
        delegate?.discoveryManager(self, didFindPeer: peer)
        
        sender.delegate = nil
    }
    
    func netService(_ sender: NetService, didNotResolve errorDict: [String: NSNumber]) {
        resolvingServices.remove(sender)
        sender.delegate = nil
        
        let errorCode = errorDict[NetService.errorCode]?.intValue ?? -1
        delegate?.discoveryManager(
            self,
            didFailWithError: "RESOLUTION_FAILED",
            message: "Failed to resolve service \(sender.name) (error code: \(errorCode))"
        )
    }
}
