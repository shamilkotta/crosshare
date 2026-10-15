package com.crossshare.core.protocol

import org.json.JSONArray
import org.json.JSONObject
import java.io.InputStream

// Shared protocol types. This package must stay free of Android APIs so it can be unit-tested on the JVM.

object Constants {
  const val SERVICE_TYPE = "_crossshare._tcp"
  const val BLE_SERVICE = "0B5E1C9A-3F2D-4E8B-9A71-6C4D2E8F1A30"
  const val BLE_INFO_CHARACTERISTIC = "0B5E1C9A-3F2D-4E8B-9A71-6C4D2E8F1A31"
  const val UPGRADE_THRESHOLD = 2L * 1024 * 1024
  const val CHUNK_SIZE = 128 * 1024
  const val BLE_CHUNK_SIZE = 16 * 1024
  const val MAX_FRAME = 1024 * 1024 + 64
}

data class LocalDevice(val id: String, val name: String, val platform: String = "android")

data class Peer(val id: String, val name: String, val platform: String, val routes: List<String>)

enum class TransferStatus {
  connecting, waiting, upgrading, transferring, completed, declined, failed, cancelled;

  val isFinal get() = this == completed || this == declined || this == failed || this == cancelled
}

data class TransferFile(
  val name: String,
  val size: Long,
  val transferred: Long = 0,
  /** Where the received file was saved (incoming, completed only). */
  val savedUri: String? = null,
)

data class Transfer(
  val id: String,
  val direction: String,
  val peerId: String,
  val peerName: String,
  val peerPlatform: String,
  val status: TransferStatus,
  val files: List<TransferFile>,
  val text: String?,
  /** "wifi", "bluetooth", "hotspot" or "aware" (Wi-Fi Aware). */
  val transport: String,
  val error: String?,
) {
  val totalBytes get() = files.sumOf { it.size }
  val transferredBytes get() = files.sumOf { it.transferred }
}

/** A file to send. */
class OutgoingFile(val name: String, val size: Long, val mime: String?, val open: () -> InputStream)

class CancelledException : Exception("Cancelled")

class ProtocolException(message: String) : Exception(message)

/** One JSON message on the wire. See docs/PROTOCOL.md. */
data class Msg(
  val t: String,
  val id: String? = null,
  val name: String? = null,
  val platform: String? = null,
  val v: Int? = null,
  val canHost: Boolean? = null,
  val canJoin: Boolean? = null,
  /** Wi-Fi Aware upgrades (Android to Android). */
  val canAware: Boolean? = null,
  val transferId: String? = null,
  val files: List<WireFile>? = null,
  val text: String? = null,
  val ssid: String? = null,
  val passphrase: String? = null,
  val host: String? = null,
  val port: Int? = null,
  val token: String? = null,
  val reason: String? = null,
  /** Upgrade offers: "aware", or absent for a hotspot. */
  val method: String? = null,
  /** Wi-Fi Aware service name to subscribe to. */
  val service: String? = null,
) {
  data class WireFile(val name: String, val size: Long, val mime: String?)

  fun toJson(): ByteArray {
    val o = JSONObject()
    o.put("t", t)
    id?.let { o.put("id", it) }
    name?.let { o.put("name", it) }
    platform?.let { o.put("platform", it) }
    v?.let { o.put("v", it) }
    canHost?.let { o.put("canHost", it) }
    canJoin?.let { o.put("canJoin", it) }
    canAware?.let { o.put("canAware", it) }
    transferId?.let { o.put("transferId", it) }
    files?.let { list ->
      val arr = JSONArray()
      for (f in list) {
        val fo = JSONObject().put("name", f.name).put("size", f.size)
        f.mime?.let { fo.put("mime", it) }
        arr.put(fo)
      }
      o.put("files", arr)
    }
    text?.let { o.put("text", it) }
    ssid?.let { o.put("ssid", it) }
    passphrase?.let { o.put("passphrase", it) }
    host?.let { o.put("host", it) }
    port?.let { o.put("port", it) }
    token?.let { o.put("token", it) }
    reason?.let { o.put("reason", it) }
    method?.let { o.put("method", it) }
    service?.let { o.put("service", it) }
    return o.toString().toByteArray(Charsets.UTF_8)
  }

  companion object {
    fun hello(d: LocalDevice, canHost: Boolean, canJoin: Boolean, canAware: Boolean) = Msg(
      "hello", id = d.id, name = d.name, platform = d.platform, v = 1, canHost = canHost, canJoin = canJoin,
      canAware = canAware,
    )

    fun parse(bytes: ByteArray): Msg {
      val o = JSONObject(String(bytes, Charsets.UTF_8))
      fun str(k: String) = if (o.has(k) && !o.isNull(k)) o.getString(k) else null
      fun bool(k: String) = if (o.has(k) && !o.isNull(k)) o.getBoolean(k) else null
      fun int(k: String) = if (o.has(k) && !o.isNull(k)) o.getInt(k) else null
      val files = o.optJSONArray("files")?.let { arr ->
        (0 until arr.length()).map { i ->
          val f = arr.getJSONObject(i)
          WireFile(
            f.getString("name"),
            f.getLong("size"),
            if (f.has("mime") && !f.isNull("mime")) f.getString("mime") else null,
          )
        }
      }
      return Msg(
        t = o.getString("t"), id = str("id"), name = str("name"), platform = str("platform"),
        v = int("v"), canHost = bool("canHost"), canJoin = bool("canJoin"), canAware = bool("canAware"),
        transferId = str("transferId"), files = files, text = str("text"), ssid = str("ssid"),
        passphrase = str("passphrase"), host = str("host"), port = int("port"),
        token = str("token"), reason = str("reason"), method = str("method"), service = str("service"),
      )
    }
  }
}
