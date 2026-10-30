package com.crosshare.core

import android.Manifest
import android.app.ActivityManager
import android.bluetooth.BluetoothAdapter
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Settings
import android.service.quicksettings.TileService
import androidx.core.content.ContextCompat
import com.crosshare.core.protocol.LocalDevice
import com.crosshare.core.protocol.Peer
import com.crosshare.core.protocol.Transfer
import java.util.UUID
import java.util.concurrent.CopyOnWriteArraySet

/**
 * Process-wide owner of the engine, so the tile, notifications and the background service keep
 * working when the React app isn't running.
 */
object CrosshareRuntime {
  interface Listener : CrosshareEngine.Listener {
    fun onVisibilityChanged(visible: Boolean)
    fun onBluetoothState(state: String)
  }

  private lateinit var context: Context
  private var engine: CrosshareEngine? = null
  private val listeners = CopyOnWriteArraySet<Listener>()
  private val active = mutableMapOf<String, Transfer>()

  private val prefs get() = context.getSharedPreferences("crosshare", Context.MODE_PRIVATE)

  @Synchronized
  fun init(c: Context) {
    if (::context.isInitialized) return
    context = c.applicationContext
    ContextCompat.registerReceiver(
      context,
      object : BroadcastReceiver() {
        override fun onReceive(c: Context, intent: Intent) {
          val e = engine ?: return
          e.refreshBluetooth()
          listeners.forEach { it.onBluetoothState(e.bluetoothState) }
        }
      },
      IntentFilter(BluetoothAdapter.ACTION_STATE_CHANGED),
      ContextCompat.RECEIVER_NOT_EXPORTED,
    )
  }

  fun addListener(l: Listener) = listeners.add(l)

  fun removeListener(l: Listener) = listeners.remove(l)

  @Synchronized
  fun engine(): CrosshareEngine {
    engine?.let { return it }
    val e = CrosshareEngine(context, localDevice(), ::hasPermissions)
    e.listener = object : CrosshareEngine.Listener {
      override fun onPeersChanged(peers: List<Peer>) {
        listeners.forEach { it.onPeersChanged(peers) }
      }

      override fun onRequest(transfer: Transfer) {
        track(transfer)
        if (!isAppInForeground()) Notifications.showRequest(context, transfer)
        listeners.forEach { it.onRequest(transfer) }
      }

      override fun onTransferUpdate(transfer: Transfer) {
        track(transfer)
        Notifications.onTransferUpdate(context, transfer)
        listeners.forEach { it.onTransferUpdate(transfer) }
      }
    }
    engine = e
    return e
  }

  // Visibility ("Everyone" / "Off"), shared by the app and the Quick Settings tile.

  val isVisible: Boolean get() = prefs.getBoolean("visible", true)

  fun setVisible(on: Boolean) {
    val changed = isVisible != on
    prefs.edit().putBoolean("visible", on).apply()
    engine().setVisible(on)
    updateService()
    if (changed) {
      if (on || hasActiveTransfers) Notifications.refreshService(context)
      runCatching {
        TileService.requestListeningState(context, ComponentName(context, CrosshareTileService::class.java))
      }
      listeners.forEach { it.onVisibilityChanged(on) }
    }
  }

  /** Applies the saved visibility, e.g. when the app or the service starts. */
  fun restore() = setVisible(isVisible)

  // Background service: runs while visible or while a transfer is in progress.

  private fun track(t: Transfer) {
    synchronized(active) {
      if (t.status.isFinal) active.remove(t.id) else active[t.id] = t
    }
    updateService()
  }

  val hasActiveTransfers: Boolean get() = synchronized(active) { active.isNotEmpty() }

  /** Transfers still in progress, including requests waiting for an answer. */
  val activeTransfers: List<Transfer> get() = synchronized(active) { active.values.toList() }

  private fun updateService() {
    if (isVisible || hasActiveTransfers) CrosshareService.start(context) else CrosshareService.stop(context)
  }

  fun isAppInForeground(): Boolean {
    val info = ActivityManager.RunningAppProcessInfo()
    ActivityManager.getMyMemoryState(info)
    return info.importance <= ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND
  }

  // Identity

  fun localDevice(): LocalDevice {
    val id = prefs.getString("id", null) ?: UUID.randomUUID().toString().also {
      prefs.edit().putString("id", it).apply()
    }
    val name = prefs.getString("name", null)
      ?: Settings.Global.getString(context.contentResolver, Settings.Global.DEVICE_NAME)
      ?: "${Build.MANUFACTURER.replaceFirstChar { it.uppercase() }} ${Build.MODEL}"
    return LocalDevice(id, name, "android")
  }

  fun setDeviceName(name: String) {
    prefs.edit().putString("name", name).apply()
    engine?.rename(name)
  }

  // Permissions

  fun requiredPermissions(): List<String> {
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

  fun hasPermissions(): Boolean = requiredPermissions().all {
    ContextCompat.checkSelfPermission(context, it) == PackageManager.PERMISSION_GRANTED
  }
}
