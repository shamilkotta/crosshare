package com.crosshare.core

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.OpenableColumns
import com.crosshare.core.protocol.LinkedDevice
import com.crosshare.core.protocol.OutgoingFile
import com.crosshare.core.protocol.Peer
import com.crosshare.core.protocol.Transfer
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileInputStream

class CrosshareCoreModule : Module() {
  private var pendingShare: Map<String, Any?>? = null
  private var handledIntent: Intent? = null

  private val context: Context
    get() = appContext.reactContext?.applicationContext ?: throw Exceptions.ReactContextLost()

  private val listener = object : CrosshareRuntime.Listener {
    override fun onPeersChanged(peers: List<Peer>) {
      sendEvent("onPeersChanged", mapOf("peers" to peers.map(::peerMap)))
    }

    override fun onRequest(transfer: Transfer) {
      sendEvent("onTransferRequest", transferMap(transfer))
    }

    override fun onTransferUpdate(transfer: Transfer) {
      sendEvent("onTransferUpdate", transferMap(transfer))
    }

    override fun onVisibilityChanged(visible: Boolean) {
      sendEvent("onVisibilityChanged", mapOf("visible" to visible))
    }

    override fun onBluetoothState(state: String) {
      sendEvent("onBluetoothState", mapOf("state" to state))
    }

    override fun onLinksChanged(links: List<LinkedDevice>) {
      sendEvent("onLinksChanged", mapOf("links" to links.map(::linkMap)))
    }
  }

  override fun definition() = ModuleDefinition {
    Name("CrosshareCore")

    Events(
      "onPeersChanged", "onTransferRequest", "onTransferUpdate", "onBluetoothState", "onShareReceived",
      "onVisibilityChanged", "onLinksChanged",
    )

    Function("getDeviceInfo") {
      val d = CrosshareRuntime.localDevice()
      mapOf("id" to d.id, "name" to d.name, "platform" to d.platform)
    }

    Function("setDeviceName") { name: String ->
      val trimmed = name.trim().take(60)
      if (trimmed.isNotEmpty()) CrosshareRuntime.setDeviceName(trimmed)
    }

    /** Runtime permissions the app should request before going visible or scanning. */
    Function("requiredPermissions") { CrosshareRuntime.requiredPermissions() }

    Function("setVisible") { on: Boolean -> CrosshareRuntime.setVisible(on) }

    /** Saved visibility, shared with the Quick Settings tile. */
    Function("isVisible") { CrosshareRuntime.isVisible }

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

    Function("getLinkedDevices") { engine().linkedDevices.map(::linkMap) }

    AsyncFunction("link") { peerId: String -> engine().link(peerId) }

    Function("unlink") { id: String -> engine().unlink(id) }

    /** Transfers in progress, e.g. ones that started while the app was closed. */
    Function("getActiveTransfers") { CrosshareRuntime.activeTransfers.map(::transferMap) }

    Function("respond") { transferId: String, accept: Boolean -> engine().respond(transferId, accept) }

    Function("cancel") { transferId: String -> engine().cancel(transferId) }

    Function("openFile") { uri: String, mime: String? ->
      val parsed = Uri.parse(uri)
      val exists = runCatching {
        context.contentResolver.openFileDescriptor(parsed, "r")?.use { true } ?: false
      }.getOrDefault(false)
      if (!exists) throw CodedException("ERR_FILE_NOT_FOUND", "File no longer exists", null)
      val type = mime ?: context.contentResolver.getType(parsed) ?: "*/*"
      val view = Intent(Intent.ACTION_VIEW).apply {
        setDataAndType(parsed, type)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      }
      val chooser = Intent.createChooser(view, null).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      try {
        (appContext.currentActivity ?: context).startActivity(chooser)
      } catch (e: android.content.ActivityNotFoundException) {
        throw CodedException("ERR_NO_APP", "No app can open this file", e)
      }
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
      CrosshareRuntime.init(context)
      CrosshareRuntime.addListener(listener)
    }

    OnDestroy {
      // Visibility outlives the app (tile, background service); discovery doesn't.
      CrosshareRuntime.removeListener(listener)
      CrosshareRuntime.engine().setDiscovering(false)
    }
  }

  private fun unsupportedWifiAware() {
    throw UnsupportedOperationException("Wi-Fi Aware pairing is only available on iOS 26+")
  }

  private fun engine() = CrosshareRuntime.engine()

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

  private fun linkMap(d: LinkedDevice) = mapOf("id" to d.id, "name" to d.name, "platform" to d.platform)

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
    "kind" to t.kind,
    "trusted" to t.trusted,
    "code" to t.code,
    "transport" to t.transport,
    "error" to t.error,
    "totalBytes" to t.totalBytes.toDouble(),
    "transferredBytes" to t.transferredBytes.toDouble(),
  )
}
