package com.crossshare.core

import android.annotation.SuppressLint
import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.net.wifi.WifiManager
import android.net.wifi.WifiNetworkSpecifier
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.crossshare.core.protocol.Conn
import com.crossshare.core.protocol.HostedNetwork
import com.crossshare.core.protocol.Msg
import com.crossshare.core.protocol.SocketConn
import java.net.Inet4Address
import java.net.InetSocketAddress
import java.net.NetworkInterface
import java.net.ServerSocket
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * Bandwidth upgrade for Bluetooth transfers: host a LocalOnlyHotspot (Android 8+)
 * or join a peer's hotspot with WifiNetworkSpecifier (Android 10+).
 */
@SuppressLint("MissingPermission")
class HotspotUpgrade(private val context: Context, private val permitted: () -> Boolean) {
  private val wifi = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
  private val connectivity = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
  private val main = Handler(Looper.getMainLooper())
  private var reservation: WifiManager.LocalOnlyHotspotReservation? = null
  private var joinCallback: ConnectivityManager.NetworkCallback? = null

  val canHost: Boolean
    get() = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && permitted()

  val canJoin: Boolean
    get() = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && permitted()

  fun host(): HostedNetwork? {
    if (!canHost) return null
    val before = ipv4Addresses()
    val latch = CountDownLatch(1)
    main.post {
      try {
        wifi.startLocalOnlyHotspot(object : WifiManager.LocalOnlyHotspotCallback() {
          override fun onStarted(r: WifiManager.LocalOnlyHotspotReservation) {
            reservation = r
            latch.countDown()
          }

          override fun onFailed(reason: Int) {
            Log.w(TAG, "LocalOnlyHotspot failed: $reason")
            latch.countDown()
          }
        }, main)
      } catch (e: Exception) {
        Log.w(TAG, "LocalOnlyHotspot unavailable", e)
        latch.countDown()
      }
    }
    latch.await(15, TimeUnit.SECONDS)
    val r = reservation ?: return null
    val (ssid, pass) = credentials(r) ?: return null.also { release() }

    // The hotspot interface's address is whichever IPv4 address just appeared.
    var host: String? = null
    val deadline = System.currentTimeMillis() + 5_000
    while (host == null && System.currentTimeMillis() < deadline) {
      host = (ipv4Addresses() - before).firstOrNull()
      if (host == null) Thread.sleep(200)
    }
    if (host == null) {
      release()
      return null
    }
    val server = ServerSocket()
    server.reuseAddress = true
    server.bind(InetSocketAddress(0))
    return HostedNetwork(Msg("upgradeOffer", ssid = ssid, passphrase = pass, host = host), server)
  }

  @Suppress("DEPRECATION")
  private fun credentials(r: WifiManager.LocalOnlyHotspotReservation): Pair<String, String>? {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      val c = r.softApConfiguration
      val ssid = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        c.wifiSsid?.toString()
      } else {
        c.ssid
      }
      val unquoted = ssid?.removeSurrounding("\"") ?: return null
      unquoted to (c.passphrase ?: "")
    } else {
      val c = r.wifiConfiguration ?: return null
      (c.SSID?.removeSurrounding("\"") ?: return null) to (c.preSharedKey?.removeSurrounding("\"") ?: "")
    }
  }

  fun join(ssid: String, passphrase: String, host: String, port: Int): Conn? {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || !canJoin) return null
    for (wpa3 in listOf(false, true)) {
      val network = requestNetwork(ssid, passphrase, wpa3) ?: continue
      repeat(10) {
        try {
          val socket = network.socketFactory.createSocket()
          socket.connect(InetSocketAddress(host, port), 5_000)
          return SocketConn(socket)
        } catch (e: Exception) {
          Thread.sleep(1_000)
        }
      }
      releaseJoin()
    }
    return null
  }

  private fun requestNetwork(ssid: String, passphrase: String, wpa3: Boolean): Network? {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return null
    val spec = WifiNetworkSpecifier.Builder().setSsid(ssid).apply {
      if (passphrase.isNotEmpty()) {
        if (wpa3) setWpa3Passphrase(passphrase) else setWpa2Passphrase(passphrase)
      }
    }.build()
    val request = NetworkRequest.Builder()
      .addTransportType(NetworkCapabilities.TRANSPORT_WIFI)
      .removeCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
      .setNetworkSpecifier(spec)
      .build()
    val latch = CountDownLatch(1)
    var result: Network? = null
    val callback = object : ConnectivityManager.NetworkCallback() {
      override fun onAvailable(network: Network) {
        result = network
        latch.countDown()
      }

      override fun onUnavailable() {
        latch.countDown()
      }
    }
    joinCallback = callback
    // Shows a system "Connect to device?" dialog the first time.
    connectivity.requestNetwork(request, callback)
    latch.await(45, TimeUnit.SECONDS)
    if (result == null) releaseJoin()
    return result
  }

  private fun releaseJoin() {
    joinCallback?.let { runCatching { connectivity.unregisterNetworkCallback(it) } }
    joinCallback = null
  }

  @Synchronized
  fun release() {
    runCatching { reservation?.close() }
    reservation = null
    releaseJoin()
  }

  private fun ipv4Addresses(): Set<String> =
    runCatching {
      NetworkInterface.getNetworkInterfaces().toList()
        .filter { it.isUp && !it.isLoopback }
        .flatMap { it.inetAddresses.toList() }
        .filterIsInstance<Inet4Address>()
        .mapNotNull { it.hostAddress }
        .toSet()
    }.getOrDefault(emptySet())

  companion object {
    private const val TAG = "CrossshareHotspot"
  }
}
