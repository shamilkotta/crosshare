package com.crossshare.lan

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class CrossshareLanModule : Module() {
    
    private var discoveryManager: DiscoveryManager? = null
    private var advertiser: Advertiser? = null

    override fun definition() = ModuleDefinition {
        // Module name for JavaScript
        Name("CrossshareLan")
        
        // Events that can be sent to JavaScript
        Events("onPeerFound", "onPeerLost", "onError")

        // Start advertising this device on the network
        AsyncFunction("startAdvertising") { options: Map<String, Any?> ->
            val serviceName = options["serviceName"] as? String
                ?: throw IllegalArgumentException("serviceName is required")
            
            val port = (options["port"] as? Number)?.toInt()
                ?: throw IllegalArgumentException("port is required")
            
            @Suppress("UNCHECKED_CAST")
            val meta = options["meta"] as? Map<String, String>
            
            getOrCreateAdvertiser().startAdvertising(serviceName, port, meta)
        }

        // Stop advertising
        AsyncFunction("stopAdvertising") {
            advertiser?.stopAdvertising()
        }

        // Start discovering other devices
        AsyncFunction("startDiscovery") {
            getOrCreateDiscoveryManager().startDiscovery()
        }

        // Stop discovery
        AsyncFunction("stopDiscovery") {
            discoveryManager?.stopDiscovery()
        }

        // Get currently discovered peers
        AsyncFunction("getDiscoveredPeers") {
            discoveryManager?.getDiscoveredPeers()?.map { it.toMap() } ?: emptyList<Map<String, Any?>>()
        }

        // Cleanup when module is destroyed
        OnDestroy {
            discoveryManager?.stopDiscovery()
            advertiser?.stopAdvertising()
            discoveryManager = null
            advertiser = null
        }
    }
    
    private fun getOrCreateDiscoveryManager(): DiscoveryManager {
        return discoveryManager ?: DiscoveryManager(
            context = appContext.reactContext ?: throw IllegalStateException("React context not available"),
            listener = object : DiscoveryListener {
                override fun onPeerFound(peer: LanPeer) {
                    sendEvent("onPeerFound", peer.toMap())
                }

                override fun onPeerLost(peerId: String) {
                    sendEvent("onPeerLost", mapOf("peerId" to peerId))
                }

                override fun onError(code: String, message: String) {
                    sendEvent("onError", mapOf(
                        "code" to code,
                        "message" to message
                    ))
                }
            }
        ).also { discoveryManager = it }
    }
    
    private fun getOrCreateAdvertiser(): Advertiser {
        return advertiser ?: Advertiser(
            context = appContext.reactContext ?: throw IllegalStateException("React context not available"),
            listener = object : AdvertiserListener {
                override fun onAdvertisingStarted() {
                    // Advertising started successfully
                }

                override fun onError(code: String, message: String) {
                    sendEvent("onError", mapOf(
                        "code" to code,
                        "message" to message
                    ))
                }
            }
        ).also { advertiser = it }
    }
}
