import ExpoModulesCore

public class CrossshareLanModule: Module {
    
    private lazy var discoveryManager: DiscoveryManager = {
        let manager = DiscoveryManager()
        manager.delegate = self
        return manager
    }()
    
    private lazy var advertiser: Advertiser = {
        let adv = Advertiser()
        adv.delegate = self
        return adv
    }()
    
    public func definition() -> ModuleDefinition {
        // Module name for JavaScript
        Name("CrossshareLan")
        
        // Events that can be sent to JavaScript
        Events("onPeerFound", "onPeerLost", "onError")
        
        // Start advertising this device on the network
        AsyncFunction("startAdvertising") { (options: [String: Any]) in
            guard let serviceName = options["serviceName"] as? String else {
                throw NSError(domain: "CrossshareLan", code: 1, userInfo: [
                    NSLocalizedDescriptionKey: "serviceName is required"
                ])
            }
            
            guard let port = options["port"] as? Int else {
                throw NSError(domain: "CrossshareLan", code: 2, userInfo: [
                    NSLocalizedDescriptionKey: "port is required"
                ])
            }
            
            let meta = options["meta"] as? [String: String]
            
            self.advertiser.startAdvertising(name: serviceName, port: port, meta: meta)
        }
        
        // Stop advertising
        AsyncFunction("stopAdvertising") {
            self.advertiser.stopAdvertising()
        }
        
        // Start discovering other devices
        AsyncFunction("startDiscovery") {
            self.discoveryManager.startDiscovery()
        }
        
        // Stop discovery
        AsyncFunction("stopDiscovery") {
            self.discoveryManager.stopDiscovery()
        }
        
        // Get currently discovered peers
        AsyncFunction("getDiscoveredPeers") { () -> [[String: Any]] in
            return self.discoveryManager.getDiscoveredPeers().map { $0.toDictionary() }
        }
        
        // Cleanup when module is destroyed
        OnDestroy {
            self.discoveryManager.stopDiscovery()
            self.advertiser.stopAdvertising()
        }
    }
}

// MARK: - DiscoveryManagerDelegate

extension CrossshareLanModule: DiscoveryManagerDelegate {
    
    func discoveryManager(_ manager: DiscoveryManager, didFindPeer peer: LanPeer) {
        sendEvent("onPeerFound", peer.toDictionary())
    }
    
    func discoveryManager(_ manager: DiscoveryManager, didLosePeer peerId: String) {
        sendEvent("onPeerLost", ["peerId": peerId])
    }
    
    func discoveryManager(_ manager: DiscoveryManager, didFailWithError code: String, message: String) {
        sendEvent("onError", [
            "code": code,
            "message": message
        ])
    }
}

// MARK: - AdvertiserDelegate

extension CrossshareLanModule: AdvertiserDelegate {
    
    func advertiserDidStart(_ advertiser: Advertiser) {
        // Advertising started successfully
        // Could emit an event here if needed
    }
    
    func advertiser(_ advertiser: Advertiser, didFailWithError code: String, message: String) {
        sendEvent("onError", [
            "code": code,
            "message": message
        ])
    }
}
