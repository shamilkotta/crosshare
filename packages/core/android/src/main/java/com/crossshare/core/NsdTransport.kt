package com.crossshare.core

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.util.Log
import com.crossshare.core.protocol.Constants
import com.crossshare.core.protocol.LocalDevice
import com.crossshare.core.protocol.SocketConn
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors

/** Same-network discovery over mDNS/DNS-SD and TCP connections. */
class NsdTransport(context: Context, private var local: LocalDevice) {
  data class Found(val id: String, val name: String, val platform: String, val host: InetAddress, val port: Int)

  private val nsd = context.getSystemService(Context.NSD_SERVICE) as NsdManager
  private val resolver = Executors.newSingleThreadExecutor()
  private var server: ServerSocket? = null
  private var registration: NsdManager.RegistrationListener? = null
  private var discovery: NsdManager.DiscoveryListener? = null
  private val found = ConcurrentHashMap<String, Found>()

  var onPeersChanged: (Map<String, Found>) -> Unit = {}
  var onIncoming: (SocketConn) -> Unit = {}

  // Listening / advertising

  @Synchronized
  fun startListening() {
    if (server != null) return
    val socket = ServerSocket(0)
    server = socket
    Thread({
      while (!socket.isClosed) {
        val client = runCatching { socket.accept() }.getOrNull() ?: break
        onIncoming(SocketConn(client))
      }
    }, "crossshare-nsd-accept").apply { isDaemon = true }.start()
    register(socket.localPort)
  }

  private fun register(port: Int) {
    val info = NsdServiceInfo().apply {
      serviceName = local.id
      serviceType = Constants.SERVICE_TYPE
      setPort(port)
      setAttribute("id", local.id)
      setAttribute("name", local.name)
      setAttribute("platform", local.platform)
      setAttribute("v", "1")
    }
    val listener = object : NsdManager.RegistrationListener {
      override fun onServiceRegistered(info: NsdServiceInfo) {}
      override fun onRegistrationFailed(info: NsdServiceInfo, code: Int) {
        Log.w(TAG, "NSD registration failed: $code")
      }
      override fun onServiceUnregistered(info: NsdServiceInfo) {}
      override fun onUnregistrationFailed(info: NsdServiceInfo, code: Int) {}
    }
    registration = listener
    nsd.registerService(info, NsdManager.PROTOCOL_DNS_SD, listener)
  }

  @Synchronized
  fun stopListening() {
    registration?.let { runCatching { nsd.unregisterService(it) } }
    registration = null
    runCatching { server?.close() }
    server = null
  }

  @Synchronized
  fun updateLocal(device: LocalDevice) {
    local = device
    val port = server?.localPort ?: return
    registration?.let { runCatching { nsd.unregisterService(it) } }
    register(port)
  }

  // Browsing

  @Synchronized
  fun startBrowsing() {
    if (discovery != null) return
    val listener = object : NsdManager.DiscoveryListener {
      override fun onDiscoveryStarted(type: String) {}
      override fun onDiscoveryStopped(type: String) {}
      override fun onStartDiscoveryFailed(type: String, code: Int) {
        Log.w(TAG, "NSD discovery failed: $code")
      }
      override fun onStopDiscoveryFailed(type: String, code: Int) {}
      override fun onServiceFound(info: NsdServiceInfo) {
        if (info.serviceName == local.id) return
        resolver.execute { resolve(info) }
      }
      override fun onServiceLost(info: NsdServiceInfo) {
        if (found.remove(info.serviceName) != null) onPeersChanged(found.toMap())
      }
    }
    discovery = listener
    nsd.discoverServices(Constants.SERVICE_TYPE, NsdManager.PROTOCOL_DNS_SD, listener)
  }

  @Synchronized
  fun stopBrowsing() {
    discovery?.let { runCatching { nsd.stopServiceDiscovery(it) } }
    discovery = null
    found.clear()
    onPeersChanged(emptyMap())
  }

  /** Resolves one service at a time (older NsdManager rejects concurrent resolves). */
  @Suppress("DEPRECATION")
  private fun resolve(info: NsdServiceInfo) {
    val done = java.util.concurrent.CountDownLatch(1)
    nsd.resolveService(info, object : NsdManager.ResolveListener {
      override fun onResolveFailed(info: NsdServiceInfo, code: Int) {
        done.countDown()
      }
      override fun onServiceResolved(info: NsdServiceInfo) {
        val attrs = info.attributes.mapValues { (_, v) -> v?.let { String(it, Charsets.UTF_8) } }
        val id = attrs["id"] ?: info.serviceName
        val host = info.host
        if (id != local.id && host != null) {
          found[info.serviceName] = Found(
            id = id,
            name = attrs["name"] ?: "Unknown device",
            platform = attrs["platform"] ?: "android",
            host = host,
            port = info.port,
          )
          onPeersChanged(found.toMap())
        }
        done.countDown()
      }
    })
    done.await(10, java.util.concurrent.TimeUnit.SECONDS)
  }

  fun connect(peer: Found): SocketConn {
    val socket = Socket()
    socket.connect(java.net.InetSocketAddress(peer.host, peer.port), 10_000)
    return SocketConn(socket)
  }

  companion object {
    private const val TAG = "CrossshareNsd"
  }
}
