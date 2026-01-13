package com.crossshare.lan

/**
 * Data class representing a discovered LAN peer
 */
data class LanPeer(
    val id: String,
    val name: String,
    val host: String,
    val port: Int,
    val platform: String,
    val meta: Map<String, String>?
) {
    /**
     * Convert to Map for JS bridge
     */
    fun toMap(): Map<String, Any?> {
        return mapOf(
            "id" to id,
            "name" to name,
            "host" to host,
            "port" to port,
            "platform" to platform,
            "meta" to meta
        )
    }
}
