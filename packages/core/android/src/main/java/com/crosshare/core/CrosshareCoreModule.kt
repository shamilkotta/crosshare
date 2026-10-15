package com.crosshare.core

import android.Manifest
import android.bluetooth.BluetoothAdapter
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.OpenableColumns
import android.provider.Settings
import androidx.core.content.ContextCompat
import com.crosshare.core.protocol.LocalDevice
import com.crosshare.core.protocol.OutgoingFile
import com.crosshare.core.protocol.Peer
import com.crosshare.core.protocol.Transfer
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileInputStream
import java.util.UUID

class CrosshareCoreModule : Module() {
  private var engine: CrosshareEngine? = null
  private var bluetoothReceiver: BroadcastReceiver? = null
  private var pendingShare: Map<String, Any?>? = null
  private var handledIntent: Intent? = null

  private val context: Context
    get() = appContext.reactContext?.applicationContext ?: throw Exceptions.ReactContextLost()

  private val prefs get() = context.getSharedPreferences("crosshare", Context.MODE_PRIVATE)

  override fun definition() = ModuleDefinition {
    Name("CrosshareCore")

    Events("onPeersChanged", "onTransferRequest", "onTransferUpdate", "onBluetoothState", "onShareReceived")

    Function("getDeviceInfo") {
      val d = localDevice()
      mapOf("id" to d.id, "name" to d.name, "platform" to d.platform)
    }

    Function("setDeviceName") { name: String ->
      val trimmed = name.trim().take(60)
      if (trimmed.isNotEmpty()) {
        prefs.edit().putString("name", trimmed).apply()
        engine?.rename(trimmed)
      }
    }

    /** Runtime permissions the app should request before going visible or scanning. */
    Function("requiredPermissions") { requiredPermissions() }

    Function("setVisible") { on: Boolean -> engine().setVisible(on) }

    Function("setDiscovering") { on: Boolean -> engine().setDiscovering(on) }

    /** Call after the user grants permissions or turns Bluetooth on. */
    Function("refresh") {
      engine().refreshBluetooth()
      sendEvent("onBluetoothState", mapOf("state" to engine().bluetoothState))
    }

    Function("getPeers") { engine().peers.map(::peerMap) }

    Function("getBluetoothState") { engine().bluetoothState }

    // Pairing-based Wi-Fi Aware with iPhones needs pairing keys that Android's public API can't use
    // (see docs/PROTOCOL.md). Android to Android still uses Wi-Fi Aware, automatically, to speed up
    // Bluetooth transfers (AwareLink), which needs no pairing.
    Function("isWifiAwareSupported") { false }

    AsyncFunction("pairWifiAware") { _: String -> unsupportedWifiAware() }

    AsyncFunction("send") { peerId: String, files: List<Map<String, Any?>>, text: String? ->
      val outgoing = files.map { outgoingFile(it) }
      engine().send(outgoing, text, peerId)
    }

    Function("respond") { transferId: String, accept: Boolean -> engine().respond(transferId, accept) }

    Function("cancel") { transferId: String -> engine().cancel(transferId) }

    Function("openFile") { uri: String, mime: String? ->
      val parsed = Uri.parse(uri)
      val type = mime ?: context.contentResolver.getType(parsed) ?: "*/*"
      val view = Intent(Intent.ACTION_VIEW).apply {
        setDataAndType(parsed, type)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      }
      val chooser = Intent.createChooser(view, null).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      (appContext.currentActivity ?: context).startActivity(chooser)
    }

    /** Files or text another app shared to Crosshare (or opened with it), once. */
    Function("getSharedItems") {
      appContext.currentActivity?.intent?.let(::takeShare)
      pendingShare.also { pendingShare = null }
    }

    OnNewIntent { intent ->
      if (takeShare(intent)) sendEvent("onShareReceived", emptyMap<String, Any>())
    }

    OnCreate {
      val receiver = object : BroadcastReceiver() {
        override fun onReceive(c: Context, intent: Intent) {
          engine?.refreshBluetooth()
          engine?.let { sendEvent("onBluetoothState", mapOf("state" to it.bluetoothState)) }
        }
      }
      bluetoothReceiver = receiver
      ContextCompat.registerReceiver(
        context, receiver, IntentFilter(BluetoothAdapter.ACTION_STATE_CHANGED), ContextCompat.RECEIVER_NOT_EXPORTED,
      )
    }

    OnDestroy {
      bluetoothReceiver?.let { runCatching { context.unregisterReceiver(it) } }
      engine?.setDiscovering(false)
      engine?.setVisible(false)
    }
  }

  private fun unsupportedWifiAware() {
    throw UnsupportedOperationException("Wi-Fi Aware pairing is only available on iOS 26+")
  }

  // Engine

  private fun engine(): CrosshareEngine {
    engine?.let { return it }
    val e = CrosshareEngine(context, localDevice(), ::hasPermissions)
    e.listener = object : CrosshareEngine.Listener {
      override fun onPeersChanged(peers: List<Peer>) {
        sendEvent("onPeersChanged", mapOf("peers" to peers.map(::peerMap)))
      }

      override fun onRequest(transfer: Transfer) {
        sendEvent("onTransferRequest", transferMap(transfer))
      }

      override fun onTransferUpdate(transfer: Transfer) {
        sendEvent("onTransferUpdate", transferMap(transfer))
      }
    }
    engine = e
    return e
  }

  private fun localDevice(): LocalDevice {
    val id = prefs.getString("id", null) ?: UUID.randomUUID().toString().also {
      prefs.edit().putString("id", it).apply()
    }
    val name = prefs.getString("name", null)
      ?: Settings.Global.getString(context.contentResolver, Settings.Global.DEVICE_NAME)
      ?: "${Build.MANUFACTURER.replaceFirstChar { it.uppercase() }} ${Build.MODEL}"
    return LocalDevice(id, name, "android")
  }

  // Permissions

  private fun requiredPermissions(): List<String> {
    val perms = mutableListOf<String>()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      perms += Manifest.permission.BLUETOOTH_SCAN
      perms += Manifest.permission.BLUETOOTH_ADVERTISE
      perms += Manifest.permission.BLUETOOTH_CONNECT
    } else {
      perms += Manifest.permission.ACCESS_FINE_LOCATION
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      perms += Manifest.permission.NEARBY_WIFI_DEVICES
    } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      // LocalOnlyHotspot still needs location before Android 13.
      perms += Manifest.permission.ACCESS_FINE_LOCATION
    }
    return perms
  }

  private fun hasPermissions(): Boolean = requiredPermissions().all {
    ContextCompat.checkSelfPermission(context, it) == PackageManager.PERMISSION_GRANTED
  }

  // Sharing into the app

  /** Reads a share or "open with" intent into pendingShare. Returns true if it held something. */
  private fun takeShare(intent: Intent): Boolean {
    if (intent === handledIntent) return false
    handledIntent = intent
    // Reopening the app from recents redelivers the original intent.
    if (intent.flags and Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY != 0) return false
    val uris = when (intent.action) {
      Intent.ACTION_SEND -> listOfNotNull(intent.streamExtra())
      Intent.ACTION_SEND_MULTIPLE -> intent.streamListExtra()
      Intent.ACTION_VIEW -> listOfNotNull(intent.data?.takeIf { it.scheme == "content" || it.scheme == "file" })
      else -> return false
    }.ifEmpty { intent.clipUris() }
    val text = if (intent.action == Intent.ACTION_VIEW) null else intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString()?.trim()
    val files = uris.map(::sharedFile)
    if (files.isEmpty() && text.isNullOrEmpty()) return false
    pendingShare = mapOf("files" to files, "text" to text?.ifEmpty { null })
    return true
  }

  @Suppress("DEPRECATION")
  private fun Intent.streamExtra(): Uri? =
    if (Build.VERSION.SDK_INT >= 33) getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
    else getParcelableExtra(Intent.EXTRA_STREAM) as? Uri

  @Suppress("DEPRECATION")
  private fun Intent.streamListExtra(): List<Uri> =
    if (Build.VERSION.SDK_INT >= 33) getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri::class.java).orEmpty()
    else getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM).orEmpty()

  // Text shares also carry a ClipData, but only with text in it.
  private fun Intent.clipUris(): List<Uri> {
    val clip = clipData ?: return emptyList()
    return (0 until clip.itemCount).mapNotNull { clip.getItemAt(it).uri }
  }

  private fun sharedFile(uri: Uri): Map<String, Any?> {
    var name: String? = null
    var size: Long? = null
    if (uri.scheme == "content") {
      runCatching {
        context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)
          ?.use { c ->
            if (c.moveToFirst()) {
              name = c.getString(0)
              if (!c.isNull(1)) size = c.getLong(1)
            }
          }
      }
    } else {
      uri.path?.let { File(it) }?.let {
        name = it.name
        size = it.length()
      }
    }
    return mapOf(
      "uri" to uri.toString(),
      "name" to (name ?: uri.lastPathSegment ?: "file"),
      "mimeType" to runCatching { context.contentResolver.getType(uri) }.getOrNull(),
      "size" to size?.toDouble(),
    )
  }

  // Conversions

  private fun outgoingFile(spec: Map<String, Any?>): OutgoingFile {
    val uri = Uri.parse(spec["uri"] as? String ?: throw IllegalArgumentException("uri is required"))
    val resolver = context.contentResolver
    var name = spec["name"] as? String
    var size = (spec["size"] as? Number)?.toLong()
    if (uri.scheme == "content") {
      resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { c ->
        if (c.moveToFirst()) {
          if (name == null) name = c.getString(0)
          if (!c.isNull(1)) size = c.getLong(1)
        }
      }
      val mime = spec["mimeType"] as? String ?: resolver.getType(uri)
      val finalSize = size ?: resolver.openAssetFileDescriptor(uri, "r")?.use { it.length }
        ?: throw IllegalArgumentException("Unknown size for $uri")
      return OutgoingFile(name ?: "file", finalSize, mime) {
        resolver.openInputStream(uri) ?: throw IllegalStateException("Cannot open $uri")
      }
    }
    val file = File(uri.path ?: throw IllegalArgumentException("Bad uri $uri"))
    return OutgoingFile(name ?: file.name, file.length(), spec["mimeType"] as? String) { FileInputStream(file) }
  }

  private fun peerMap(p: Peer) = mapOf(
    "id" to p.id, "name" to p.name, "platform" to p.platform, "routes" to p.routes,
  )

  private fun transferMap(t: Transfer) = mapOf(
    "id" to t.id,
    "direction" to t.direction,
    "peerId" to t.peerId,
    "peerName" to t.peerName,
    "peerPlatform" to t.peerPlatform,
    "status" to t.status.name,
    "files" to t.files.map {
      mapOf("name" to it.name, "size" to it.size.toDouble(), "transferred" to it.transferred.toDouble(), "uri" to it.savedUri)
    },
    "text" to t.text,
    "transport" to t.transport,
    "error" to t.error,
    "totalBytes" to t.totalBytes.toDouble(),
    "transferredBytes" to t.transferredBytes.toDouble(),
  )
}
