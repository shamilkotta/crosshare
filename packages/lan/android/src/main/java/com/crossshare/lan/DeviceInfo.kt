package com.crossshare.lan

import android.bluetooth.BluetoothAdapter
import android.content.Context
import android.os.Build
import android.provider.Settings
import java.util.UUID

/**
 * Data class representing device information
 */
data class DeviceInfo(
    val id: String,
    val name: String
)

/**
 * Utility object for retrieving device information
 */
object DeviceInfoHelper {
    
    /**
     * Get a stable device identifier
     * Uses ANDROID_ID with UUID fallback
     */
    fun getDeviceId(context: Context): String {
        return try {
            Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID)
                ?: UUID.randomUUID().toString()
        } catch (e: Exception) {
            UUID.randomUUID().toString()
        }
    }
    
    /**
     * Get the device name
     * Priority:
     * 1. Settings.Global.DEVICE_NAME (user-defined, Android 7.1+)
     * 2. BluetoothAdapter name (often user-set)
     * 3. Build.MODEL (device model as fallback)
     */
    fun getDeviceName(context: Context): String {
        // Try to get user-defined device name (Android 7.1+)
        try {
            val deviceName = Settings.Global.getString(context.contentResolver, Settings.Global.DEVICE_NAME)
            if (!deviceName.isNullOrBlank()) {
                return deviceName
            }
        } catch (e: Exception) {
            // Ignore and try next option
        }
        
        // Try Bluetooth adapter name (often user-defined)
        try {
            @Suppress("DEPRECATION")
            val bluetoothName = BluetoothAdapter.getDefaultAdapter()?.name
            if (!bluetoothName.isNullOrBlank()) {
                return bluetoothName
            }
        } catch (e: Exception) {
            // Ignore and use fallback
        }
        
        // Fallback to device model
        return Build.MODEL ?: "Android Device"
    }
    
    /**
     * Get complete device info (id and name)
     */
    fun getDeviceInfo(context: Context): DeviceInfo {
        return DeviceInfo(
            id = getDeviceId(context),
            name = getDeviceName(context)
        )
    }
}
