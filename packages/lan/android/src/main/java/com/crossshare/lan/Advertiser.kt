package com.crossshare.lan

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo

/**
 * Listener interface for advertiser events
 */
interface AdvertiserListener {
    fun onAdvertisingStarted()
    fun onError(code: String, message: String)
}

/**
 * Handles NSD service registration for advertising this device
 */
class Advertiser(
    private val context: Context,
    private val listener: AdvertiserListener
) {
    companion object {
        private const val SERVICE_TYPE = "_crossshare._tcp."
    }

    private var nsdManager: NsdManager? = null
    private var registrationListener: NsdManager.RegistrationListener? = null
    private var registeredServiceName: String? = null
    
    private var isAdvertising = false

    /**
     * Start advertising this device
     * @param name Service name to advertise
     * @param port Port number the service is running on
     * @param meta Optional metadata to include in TXT records
     */
    fun startAdvertising(name: String, port: Int, meta: Map<String, String>?) {
        if (isAdvertising) return
        
        stopAdvertising()
        
        nsdManager = context.getSystemService(Context.NSD_SERVICE) as NsdManager
        
        val serviceInfo = NsdServiceInfo().apply {
            serviceName = name
            serviceType = SERVICE_TYPE
            setPort(port)
            
            // Add TXT records
            val deviceId = DeviceInfoHelper.getDeviceId(context)
            val deviceName = DeviceInfoHelper.getDeviceName(context)
            setAttribute("id", deviceId)
            setAttribute("deviceName", deviceName)
            setAttribute("platform", "android")
            setAttribute("version", "1")
            
            // Add custom metadata
            meta?.forEach { (key, value) ->
                setAttribute(key, value)
            }
        }
        
        registrationListener = object : NsdManager.RegistrationListener {
            override fun onServiceRegistered(serviceInfo: NsdServiceInfo) {
                registeredServiceName = serviceInfo.serviceName
                isAdvertising = true
                listener.onAdvertisingStarted()
            }

            override fun onRegistrationFailed(serviceInfo: NsdServiceInfo, errorCode: Int) {
                isAdvertising = false
                listener.onError("ADVERTISING_FAILED", "Failed to register service (error code: $errorCode)")
            }

            override fun onServiceUnregistered(serviceInfo: NsdServiceInfo) {
                isAdvertising = false
            }

            override fun onUnregistrationFailed(serviceInfo: NsdServiceInfo, errorCode: Int) {
                // Ignore unregistration failures
            }
        }

        try {
            nsdManager?.registerService(serviceInfo, NsdManager.PROTOCOL_DNS_SD, registrationListener)
        } catch (e: Exception) {
            listener.onError("ADVERTISING_FAILED", "Failed to register service: ${e.message}")
        }
    }

    /**
     * Stop advertising
     */
    fun stopAdvertising() {
        try {
            registrationListener?.let { listener ->
                nsdManager?.unregisterService(listener)
            }
        } catch (e: Exception) {
            // Ignore errors during stop
        }
        
        registrationListener = null
        registeredServiceName = null
        isAdvertising = false
    }

}
