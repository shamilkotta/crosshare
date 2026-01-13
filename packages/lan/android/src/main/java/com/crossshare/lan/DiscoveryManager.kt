package com.crossshare.lan

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.os.Handler
import android.os.Looper
import java.net.InetAddress

/**
 * Listener interface for discovery events
 */
interface DiscoveryListener {
    fun onPeerFound(peer: LanPeer)
    fun onPeerLost(peerId: String)
    fun onError(code: String, message: String)
}

/**
 * Handles NSD (Network Service Discovery) for finding nearby devices
 */
class DiscoveryManager(
    private val context: Context,
    private val listener: DiscoveryListener
) {
    companion object {
        private const val SERVICE_TYPE = "_crossshare._tcp."
    }

    private var nsdManager: NsdManager? = null
    private var discoveryListener: NsdManager.DiscoveryListener? = null
    private val discoveredServices = mutableMapOf<String, NsdServiceInfo>()
    private val resolvedPeers = mutableMapOf<String, LanPeer>()
    private val resolvingServices = mutableSetOf<String>()
    private val mainHandler = Handler(Looper.getMainLooper())
    
    private var isDiscovering = false

    /**
     * Start discovering nearby Crossshare devices
     */
    fun startDiscovery() {
        if (isDiscovering) return
        
        stopDiscovery()
        
        nsdManager = context.getSystemService(Context.NSD_SERVICE) as NsdManager
        
        discoveryListener = object : NsdManager.DiscoveryListener {
            override fun onDiscoveryStarted(serviceType: String) {
                isDiscovering = true
            }

            override fun onServiceFound(serviceInfo: NsdServiceInfo) {
                val serviceId = getServiceId(serviceInfo)
                discoveredServices[serviceId] = serviceInfo
                
                // Only resolve if not already resolving
                if (!resolvingServices.contains(serviceId)) {
                    resolvingServices.add(serviceId)
                    resolveService(serviceInfo)
                }
            }

            override fun onServiceLost(serviceInfo: NsdServiceInfo) {
                val serviceId = getServiceId(serviceInfo)
                discoveredServices.remove(serviceId)
                resolvingServices.remove(serviceId)
                
                resolvedPeers.remove(serviceId)?.let { peer ->
                    mainHandler.post {
                        listener.onPeerLost(peer.id)
                    }
                }
            }

            override fun onDiscoveryStopped(serviceType: String) {
                isDiscovering = false
            }

            override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) {
                isDiscovering = false
                mainHandler.post {
                    listener.onError("DISCOVERY_FAILED", "Failed to start discovery (error code: $errorCode)")
                }
            }

            override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) {
                // Ignore stop failures
            }
        }

        try {
            nsdManager?.discoverServices(SERVICE_TYPE, NsdManager.PROTOCOL_DNS_SD, discoveryListener)
        } catch (e: Exception) {
            listener.onError("DISCOVERY_FAILED", "Failed to start discovery: ${e.message}")
        }
    }

    /**
     * Stop discovery
     */
    fun stopDiscovery() {
        try {
            discoveryListener?.let { listener ->
                nsdManager?.stopServiceDiscovery(listener)
            }
        } catch (e: Exception) {
            // Ignore errors during stop
        }
        
        discoveryListener = null
        discoveredServices.clear()
        resolvedPeers.clear()
        resolvingServices.clear()
        isDiscovering = false
    }

    /**
     * Get current list of discovered peers
     */
    fun getDiscoveredPeers(): List<LanPeer> {
        return resolvedPeers.values.toList()
    }

    /**
     * Resolve a service to get its IP and port
     */
    private fun resolveService(serviceInfo: NsdServiceInfo) {
        val resolveListener = object : NsdManager.ResolveListener {
            override fun onResolveFailed(serviceInfo: NsdServiceInfo, errorCode: Int) {
                val serviceId = getServiceId(serviceInfo)
                resolvingServices.remove(serviceId)
                
                mainHandler.post {
                    listener.onError("RESOLUTION_FAILED", "Failed to resolve service ${serviceInfo.serviceName} (error code: $errorCode)")
                }
            }

            override fun onServiceResolved(serviceInfo: NsdServiceInfo) {
                val serviceId = getServiceId(serviceInfo)
                resolvingServices.remove(serviceId)
                
                val host = serviceInfo.host?.hostAddress ?: return
                val port = serviceInfo.port
                
                // Parse TXT records (attributes)
                val attributes = mutableMapOf<String, String>()
                try {
                    serviceInfo.attributes.forEach { (key, value) ->
                        value?.let {
                            attributes[key] = String(it, Charsets.UTF_8)
                        }
                    }
                } catch (e: Exception) {
                    // Ignore attribute parsing errors
                }
                
                val peerId = attributes["id"] ?: serviceId
                val platform = attributes["platform"] ?: "android"
                
                // Remove standard keys from meta
                val meta = attributes.toMutableMap().apply {
                    remove("id")
                    remove("platform")
                    remove("version")
                }
                
                val peer = LanPeer(
                    id = peerId,
                    name = serviceInfo.serviceName,
                    host = host,
                    port = port,
                    platform = platform,
                    meta = if (meta.isEmpty()) null else meta
                )
                
                resolvedPeers[serviceId] = peer
                
                mainHandler.post {
                    listener.onPeerFound(peer)
                }
            }
        }

        try {
            nsdManager?.resolveService(serviceInfo, resolveListener)
        } catch (e: Exception) {
            resolvingServices.remove(getServiceId(serviceInfo))
            listener.onError("RESOLUTION_FAILED", "Failed to resolve service: ${e.message}")
        }
    }

    /**
     * Generate a unique ID for a service
     */
    private fun getServiceId(serviceInfo: NsdServiceInfo): String {
        return "${serviceInfo.serviceName}.${serviceInfo.serviceType}"
    }
}
