package com.crosshare.core

import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.net.wifi.aware.AttachCallback
import android.net.wifi.aware.DiscoverySession
import android.net.wifi.aware.DiscoverySessionCallback
import android.net.wifi.aware.PeerHandle
import android.net.wifi.aware.PublishConfig
import android.net.wifi.aware.PublishDiscoverySession
import android.net.wifi.aware.SubscribeConfig
import android.net.wifi.aware.SubscribeDiscoverySession
import android.net.wifi.aware.WifiAwareManager
import android.net.wifi.aware.WifiAwareNetworkInfo
import android.net.wifi.aware.WifiAwareNetworkSpecifier
import android.net.wifi.aware.WifiAwareSession
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.crosshare.core.protocol.Conn
import com.crosshare.core.protocol.HostedNetwork
import com.crosshare.core.protocol.Msg
import com.crosshare.core.protocol.SocketConn
import java.net.Inet6Address
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.security.SecureRandom
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * Wi-Fi Aware (NAN) link between two Android 10+ phones, used to speed up Bluetooth transfers.
 *
 * The host publishes a one-off service name; the joiner learns it, with a passphrase, over the
 * encrypted Bluetooth channel. The joiner subscribes, messages the host so it learns the joiner's
 * peer handle, and both request a passphrase-secured data path. The host's TCP port travels inside
 * the data-path setup, and the joiner connects to the host's link-local IPv6 address.
 */
@SuppressLint("MissingPermission", "NewApi")
class AwareLink(private val context: Context, private val permitted: () -> Boolean) {
  private val manager = context.getSystemService(Context.WIFI_AWARE_SERVICE) as? WifiAwareManager
  private val connectivity = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
  private val main = Handler(Looper.getMainLooper())
  private var session: WifiAwareSession? = null
  private var discovery: DiscoverySession? = null
  private var networkCallback: ConnectivityManager.NetworkCallback? = null

  val isAvailable: Boolean
    get() = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q &&
      context.packageManager.hasSystemFeature(PackageManager.FEATURE_WIFI_AWARE) &&
      manager?.isAvailable == true && permitted()

  /** Publishes a fresh service and returns its offer. The data path is set up once the joiner messages us. */
  fun host(): HostedNetwork? {
    if (!isAvailable) return null
    val aware = attach() ?: return null
    val service = "crosshare-${randomHex(4)}"
    val passphrase = randomHex(16)
    val server = ServerSocket()
    server.reuseAddress = true
    server.bind(InetSocketAddress(0))

    val started = CountDownLatch(1)
    var publish: PublishDiscoverySession? = null
    main.post {
      aware.publish(
        PublishConfig.Builder().setServiceName(service).build(),
        object : DiscoverySessionCallback() {
          override fun onPublishStarted(s: PublishDiscoverySession) {
            publish = s
            discovery = s
            started.countDown()
          }

          override fun onSessionConfigFailed() {
            started.countDown()
          }

          override fun onMessageReceived(peer: PeerHandle, message: ByteArray) {
            val s = publish ?: return
            if (networkCallback != null || !message.contentEquals(JOIN)) return
            val spec = WifiAwareNetworkSpecifier.Builder(s, peer)
              .setPskPassphrase(passphrase)
              .setPort(server.localPort)
              .build()
            requestNetwork(spec) { _, _ -> }
          }
        },
        main,
      )
    }
    started.await(10, TimeUnit.SECONDS)
    if (publish == null) {
      Log.w(TAG, "publish failed")
      runCatching { server.close() }
      release()
      return null
    }
    return HostedNetwork(Msg("upgradeOffer", method = "aware", service = service, passphrase = passphrase), server)
  }

  /** Finds the host's service, sets up the data path and connects to it. */
  fun join(service: String, passphrase: String): Conn? {
    if (!isAvailable) return null
    val aware = attach() ?: return null

    val found = CountDownLatch(1)
    var subscribe: SubscribeDiscoverySession? = null
    var peer: PeerHandle? = null
    var sent = CountDownLatch(1)
    main.post {
      aware.subscribe(
        SubscribeConfig.Builder().setServiceName(service).build(),
        object : DiscoverySessionCallback() {
          override fun onSubscribeStarted(s: SubscribeDiscoverySession) {
            subscribe = s
            discovery = s
          }

          override fun onSessionConfigFailed() {
            found.countDown()
          }

          override fun onServiceDiscovered(p: PeerHandle, info: ByteArray?, filter: List<ByteArray>?) {
            if (peer == null) {
              peer = p
              found.countDown()
            }
          }

          override fun onMessageSendSucceeded(messageId: Int) {
            sent.countDown()
          }
        },
        main,
      )
    }
    found.await(20, TimeUnit.SECONDS)
    val s = subscribe
    val p = peer
    if (s == null || p == null) {
      Log.w(TAG, "service not found")
      release()
      return null
    }

    // Discovery messages are best effort; retry until one is acknowledged.
    for (attempt in 0 until 3) {
      sent = CountDownLatch(1)
      main.post { s.sendMessage(p, attempt, JOIN) }
      if (sent.await(3, TimeUnit.SECONDS)) break
    }

    val ready = CountDownLatch(1)
    var link: Triple<Network, Inet6Address, Int>? = null
    val spec = WifiAwareNetworkSpecifier.Builder(s, p).setPskPassphrase(passphrase).build()
    requestNetwork(spec) { network, info ->
      val address = info.peerIpv6Addr
      if (link == null && address != null && info.port > 0) {
        link = Triple(network, address, info.port)
        ready.countDown()
      }
    }
    ready.await(30, TimeUnit.SECONDS)
    val (network, address, port) = link ?: run {
      Log.w(TAG, "data path not established")
      release()
      return null
    }
    repeat(5) {
      try {
        val socket = network.socketFactory.createSocket()
        socket.connect(InetSocketAddress(address, port), 5_000)
        return SocketConn(socket)
      } catch (e: Exception) {
        Thread.sleep(1_000)
      }
    }
    release()
    return null
  }

  private fun attach(): WifiAwareSession? {
    val m = manager ?: return null
    val latch = CountDownLatch(1)
    main.post {
      m.attach(object : AttachCallback() {
        override fun onAttached(s: WifiAwareSession) {
          session = s
          latch.countDown()
        }

        override fun onAttachFailed() {
          Log.w(TAG, "attach failed")
          latch.countDown()
        }
      }, main)
    }
    latch.await(10, TimeUnit.SECONDS)
    return session
  }

  private fun requestNetwork(spec: WifiAwareNetworkSpecifier, onLink: (Network, WifiAwareNetworkInfo) -> Unit) {
    val request = NetworkRequest.Builder()
      .addTransportType(NetworkCapabilities.TRANSPORT_WIFI_AWARE)
      .setNetworkSpecifier(spec)
      .build()
    val callback = object : ConnectivityManager.NetworkCallback() {
      override fun onCapabilitiesChanged(network: Network, caps: NetworkCapabilities) {
        (caps.transportInfo as? WifiAwareNetworkInfo)?.let { onLink(network, it) }
      }
    }
    networkCallback = callback
    connectivity.requestNetwork(request, callback)
  }

  /** Tears down the data path, the discovery session and the attachment. */
  @Synchronized
  fun release() {
    networkCallback?.let { runCatching { connectivity.unregisterNetworkCallback(it) } }
    networkCallback = null
    runCatching { discovery?.close() }
    discovery = null
    runCatching { session?.close() }
    session = null
  }

  private fun randomHex(bytes: Int) =
    ByteArray(bytes).also { SecureRandom().nextBytes(it) }.joinToString("") { "%02x".format(it) }

  companion object {
    private const val TAG = "CrosshareAware"
    private val JOIN = "crosshare-join".toByteArray()
  }
}
