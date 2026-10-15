package com.crossshare.core

import android.content.Context
import com.crossshare.core.protocol.Conn
import com.crossshare.core.protocol.LocalDevice
import com.crossshare.core.protocol.OutgoingFile
import com.crossshare.core.protocol.Peer
import com.crossshare.core.protocol.Transfer
import com.crossshare.core.protocol.TransferSession
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors

/** Discovers nearby devices and runs transfers. Listener calls come from background threads. */
class CrossshareEngine(
  private val context: Context,
  device: LocalDevice,
  private val hasPermissions: () -> Boolean,
) {
  interface Listener {
    fun onPeersChanged(peers: List<Peer>)
    fun onRequest(transfer: Transfer)
    fun onTransferUpdate(transfer: Transfer)
  }

  var listener: Listener? = null
  var device: LocalDevice = device
    private set

  private val nsd = NsdTransport(context, device)
  private val ble = BleTransport(context, device)
  private val storage = AndroidStorage(context)
  private val io = Executors.newCachedThreadPool()

  private val lock = Object()
  private var lanPeers: Map<String, NsdTransport.Found> = emptyMap()
  private var blePeers: Map<String, BleTransport.Found> = emptyMap()
  private val sessions = ConcurrentHashMap<String, TransferSession>()
  private var visible = false
  private var discovering = false
  private var lastPeers: List<Peer> = emptyList()

  val bluetoothState: String get() = ble.state

  init {
    nsd.onPeersChanged = { found ->
      synchronized(lock) { lanPeers = found.values.associateBy { it.id } }
      publishPeers()
    }
    nsd.onIncoming = { conn -> accept(conn, "wifi") }
    ble.onPeersChanged = { found ->
      synchronized(lock) { blePeers = found }
      publishPeers()
    }
    ble.onIncoming = { conn -> accept(conn, "bluetooth") }
  }

  // Visibility and discovery

  fun setVisible(on: Boolean) {
    synchronized(lock) {
      if (visible == on) return
      visible = on
    }
    io.execute {
      if (on) {
        runCatching { nsd.startListening() }
        if (hasPermissions()) ble.startAdvertising()
      } else {
        nsd.stopListening()
        ble.stopAdvertising()
      }
    }
  }

  fun setDiscovering(on: Boolean) {
    synchronized(lock) {
      if (discovering == on) return
      discovering = on
    }
    if (on) {
      nsd.startBrowsing()
      if (hasPermissions()) ble.startScanning()
    } else {
      nsd.stopBrowsing()
      ble.stopScanning()
    }
  }

  /** Restarts Bluetooth after permissions are granted or the adapter turns on. */
  fun refreshBluetooth() {
    val (v, d) = synchronized(lock) { visible to discovering }
    if (!hasPermissions()) return
    if (v) {
      ble.stopAdvertising()
      ble.startAdvertising()
    }
    if (d) {
      ble.stopScanning()
      ble.startScanning()
    }
  }

  fun rename(name: String) {
    device = device.copy(name = name)
    io.execute { nsd.updateLocal(device) }
    ble.updateLocal(device)
  }

  val peers: List<Peer>
    get() = synchronized(lock) {
      (lanPeers.keys + blePeers.keys).map { id ->
        val l = lanPeers[id]
        val b = blePeers[id]
        Peer(
          id = id,
          name = l?.name ?: b?.name ?: "Unknown device",
          platform = l?.platform ?: b?.platform ?: "android",
          routes = listOfNotNull(l?.let { "wifi" }, b?.let { "bluetooth" }),
        )
      }.sortedBy { it.name.lowercase() }
    }

  private fun publishPeers() {
    val current = peers
    synchronized(lock) {
      if (current == lastPeers) return
      lastPeers = current
    }
    listener?.onPeersChanged(current)
  }

  // Transfers

  /** Sends files and/or text to a nearby device. Returns the transfer id. */
  fun send(files: List<OutgoingFile>, text: String?, peerId: String): String {
    val (lan, bt) = synchronized(lock) { lanPeers[peerId] to blePeers[peerId] }
    val peer = Peer(peerId, lan?.name ?: bt?.name ?: "Unknown device", lan?.platform ?: bt?.platform ?: "android", emptyList())
    val id = UUID.randomUUID().toString()
    val session = makeSession(id, "outgoing", peer)
    when {
      lan != null -> session.startOutgoing(files, text, "wifi") { nsd.connect(lan) }
      bt != null -> session.startOutgoing(files, text, "bluetooth") { ble.connect(bt) }
      else -> {
        sessions.remove(id)
        throw IllegalStateException("Device is no longer nearby")
      }
    }
    return id
  }

  fun respond(transferId: String, accept: Boolean) {
    sessions[transferId]?.respond(accept)
  }

  fun cancel(transferId: String) {
    sessions[transferId]?.cancel()
  }

  private fun accept(conn: Conn, route: String) {
    if (!synchronized(lock) { visible }) {
      conn.close()
      return
    }
    makeSession(UUID.randomUUID().toString(), "incoming", null).startIncoming(conn, route, storage)
  }

  private fun makeSession(id: String, direction: String, peer: Peer?): TransferSession {
    val session = TransferSession(
      id = id,
      local = device,
      direction = direction,
      peer = peer,
      upgrade = NetworkUpgrade(context, hasPermissions),
      onUpdate = { t ->
        if (t.status.isFinal) {
          io.execute {
            Thread.sleep(30_000)
            sessions.remove(t.id)
          }
        }
        listener?.onTransferUpdate(t)
      },
      onRequest = { t -> listener?.onRequest(t) },
    )
    sessions[id] = session
    return session
  }
}
