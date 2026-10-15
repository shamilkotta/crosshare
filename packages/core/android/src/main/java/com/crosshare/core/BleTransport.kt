package com.crosshare.core

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattServer
import android.bluetooth.BluetoothGattServerCallback
import android.bluetooth.BluetoothGattService
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.bluetooth.BluetoothServerSocket
import android.bluetooth.BluetoothSocket
import android.bluetooth.le.AdvertiseCallback
import android.bluetooth.le.AdvertiseData
import android.bluetooth.le.AdvertiseSettings
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.ParcelUuid
import android.util.Log
import com.crosshare.core.protocol.Conn
import com.crosshare.core.protocol.Constants
import com.crosshare.core.protocol.LocalDevice
import org.json.JSONObject
import java.io.InputStream
import java.io.OutputStream
import java.util.UUID

class BluetoothConn(private val socket: BluetoothSocket) : Conn {
  override val input: InputStream = socket.inputStream
  override val output: OutputStream = socket.outputStream
  override fun close() {
    runCatching { socket.close() }
  }
}

/**
 * Bluetooth LE discovery (GATT info characteristic) and L2CAP channels for data.
 * Works between any two devices in radio range. L2CAP needs Android 10+.
 * Callers must hold the Bluetooth runtime permissions.
 */
@SuppressLint("MissingPermission")
class BleTransport(private val context: Context, private var local: LocalDevice) {
  data class Found(
    val id: String,
    val name: String,
    val platform: String,
    val psm: Int,
    val device: BluetoothDevice,
    val lastSeen: Long,
  )

  private val serviceUuid = UUID.fromString(Constants.BLE_SERVICE)
  private val infoUuid = UUID.fromString(Constants.BLE_INFO_CHARACTERISTIC)
  private val manager = context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager?
  private val adapter: BluetoothAdapter? get() = manager?.adapter
  private val main = Handler(Looper.getMainLooper())

  // All state below is touched on the main thread only.
  private var scanning = false
  private var advertising = false
  private var gattServer: BluetoothGattServer? = null
  private var l2capServer: BluetoothServerSocket? = null
  private var psm = 0
  private val known = HashMap<String, Found>() // by BLE address
  private val fetching = HashMap<String, Long>()
  private val lastFailure = HashMap<String, Long>()

  var onPeersChanged: (Map<String, Found>) -> Unit = {}
  var onIncoming: (Conn) -> Unit = {}

  val isSupported: Boolean
    get() = adapter != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q

  val state: String
    get() = when {
      adapter == null -> "unsupported"
      Build.VERSION.SDK_INT < Build.VERSION_CODES.Q -> "unsupported"
      adapter?.isEnabled == true -> "on"
      else -> "off"
    }

  // Advertising (we are discoverable)

  fun startAdvertising() = main.post {
    if (advertising || !isSupported || adapter?.isEnabled != true) return@post
    try {
      val server = adapter!!.listenUsingInsecureL2capChannel()
      l2capServer = server
      psm = server.psm
      Thread({
        while (true) {
          val socket = runCatching { server.accept() }.getOrNull() ?: break
          onIncoming(BluetoothConn(socket))
        }
      }, "crosshare-l2cap-accept").apply { isDaemon = true }.start()

      gattServer = manager!!.openGattServer(context, gattCallback)?.also { gatt ->
        val service = BluetoothGattService(serviceUuid, BluetoothGattService.SERVICE_TYPE_PRIMARY)
        service.addCharacteristic(
          BluetoothGattCharacteristic(
            infoUuid,
            BluetoothGattCharacteristic.PROPERTY_READ,
            BluetoothGattCharacteristic.PERMISSION_READ,
          ),
        )
        gatt.addService(service)
      }

      val settings = AdvertiseSettings.Builder()
        .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
        .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_HIGH)
        .setConnectable(true)
        .setTimeout(0)
        .build()
      val data = AdvertiseData.Builder()
        .addServiceUuid(ParcelUuid(serviceUuid))
        .setIncludeDeviceName(false)
        .build()
      adapter!!.bluetoothLeAdvertiser?.startAdvertising(settings, data, advertiseCallback)
      advertising = true
    } catch (e: Exception) {
      Log.w(TAG, "BLE advertising failed", e)
      teardownAdvertising()
    }
  }

  fun stopAdvertising() = main.post { teardownAdvertising() }

  fun updateLocal(device: LocalDevice) = main.post { local = device }

  private fun teardownAdvertising() {
    runCatching { adapter?.bluetoothLeAdvertiser?.stopAdvertising(advertiseCallback) }
    runCatching { gattServer?.close() }
    runCatching { l2capServer?.close() }
    gattServer = null
    l2capServer = null
    psm = 0
    advertising = false
  }

  private val advertiseCallback = object : AdvertiseCallback() {
    override fun onStartFailure(errorCode: Int) {
      Log.w(TAG, "BLE advertise failed: $errorCode")
    }
  }

  private fun infoBytes(): ByteArray =
    JSONObject()
      .put("id", local.id)
      .put("name", local.name)
      .put("platform", local.platform)
      .put("v", 1)
      .put("psm", psm)
      .toString()
      .toByteArray(Charsets.UTF_8)

  private val gattCallback = object : BluetoothGattServerCallback() {
    override fun onCharacteristicReadRequest(
      device: BluetoothDevice,
      requestId: Int,
      offset: Int,
      characteristic: BluetoothGattCharacteristic,
    ) {
      val server = gattServer ?: return
      if (characteristic.uuid != infoUuid) {
        server.sendResponse(device, requestId, BluetoothGatt.GATT_FAILURE, offset, null)
        return
      }
      val value = infoBytes()
      val slice = if (offset < value.size) value.copyOfRange(offset, value.size) else ByteArray(0)
      server.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, slice)
    }
  }

  // Scanning

  fun startScanning() = main.post {
    if (scanning || !isSupported || adapter?.isEnabled != true) return@post
    val scanner = adapter?.bluetoothLeScanner ?: return@post
    val filters = listOf(ScanFilter.Builder().setServiceUuid(ParcelUuid(serviceUuid)).build())
    val settings = ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build()
    runCatching { scanner.startScan(filters, settings, scanCallback) }
      .onFailure { Log.w(TAG, "BLE scan failed", it) }
      .onSuccess {
        scanning = true
        main.postDelayed(pruneRunnable, 5_000)
      }
  }

  fun stopScanning() = main.post {
    if (scanning) runCatching { adapter?.bluetoothLeScanner?.stopScan(scanCallback) }
    scanning = false
    main.removeCallbacks(pruneRunnable)
    known.clear()
    emit()
  }

  private val pruneRunnable = object : Runnable {
    override fun run() {
      val now = System.currentTimeMillis()
      val before = known.size
      known.entries.removeAll { now - it.value.lastSeen > 20_000 }
      fetching.entries.removeAll { now - it.value > 15_000 }
      if (known.size != before) emit()
      if (scanning) main.postDelayed(this, 5_000)
    }
  }

  private val scanCallback = object : ScanCallback() {
    override fun onScanResult(callbackType: Int, result: ScanResult) {
      val address = result.device.address
      val existing = known[address]
      if (existing != null) {
        known[address] = existing.copy(lastSeen = System.currentTimeMillis())
      } else {
        fetchInfo(result.device)
      }
    }

    override fun onScanFailed(errorCode: Int) {
      Log.w(TAG, "BLE scan failed: $errorCode")
      scanning = false
    }
  }

  private fun emit() {
    val byId = HashMap<String, Found>()
    for (f in known.values) {
      if (f.psm == 0) continue
      val existing = byId[f.id]
      if (existing == null || existing.lastSeen < f.lastSeen) byId[f.id] = f
    }
    onPeersChanged(byId)
  }

  private fun fetchInfo(device: BluetoothDevice) {
    val address = device.address
    val now = System.currentTimeMillis()
    if (fetching.containsKey(address) || fetching.size >= 2) return
    if ((lastFailure[address] ?: 0) > now - 15_000) return
    fetching[address] = now

    device.connectGatt(context, false, object : BluetoothGattCallback() {
      private var finished = false

      private fun done(gatt: BluetoothGatt, found: Found?) = main.post {
        if (finished) return@post
        finished = true
        runCatching { gatt.disconnect() }
        runCatching { gatt.close() }
        fetching.remove(address)
        if (found == null) {
          lastFailure[address] = System.currentTimeMillis()
        } else if (found.id != local.id) {
          known[address] = found
          emit()
        }
      }

      override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
        if (newState == BluetoothProfile.STATE_CONNECTED && status == BluetoothGatt.GATT_SUCCESS) {
          gatt.discoverServices()
        } else {
          done(gatt, null)
        }
      }

      override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
        val c = gatt.getService(serviceUuid)?.getCharacteristic(infoUuid)
        if (c == null || !gatt.readCharacteristic(c)) done(gatt, null)
      }

      @Deprecated("Deprecated in API 33")
      override fun onCharacteristicRead(gatt: BluetoothGatt, c: BluetoothGattCharacteristic, status: Int) {
        @Suppress("DEPRECATION")
        handleInfo(gatt, c.value, status)
      }

      override fun onCharacteristicRead(
        gatt: BluetoothGatt,
        c: BluetoothGattCharacteristic,
        value: ByteArray,
        status: Int,
      ) {
        handleInfo(gatt, value, status)
      }

      private fun handleInfo(gatt: BluetoothGatt, value: ByteArray?, status: Int) {
        if (status != BluetoothGatt.GATT_SUCCESS || value == null) {
          done(gatt, null)
          return
        }
        val found = runCatching {
          val json = JSONObject(String(value, Charsets.UTF_8))
          Found(
            id = json.getString("id"),
            name = json.optString("name", "Unknown device"),
            platform = json.optString("platform", "ios"),
            psm = json.optInt("psm", 0),
            device = device,
            lastSeen = System.currentTimeMillis(),
          )
        }.getOrNull()
        done(gatt, found)
      }
    }, BluetoothDevice.TRANSPORT_LE)
  }

  /** Opens an L2CAP channel to a discovered peer. Blocking. */
  fun connect(peer: Found): Conn {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) throw IllegalStateException("Needs Android 10")
    runCatching { adapter?.bluetoothLeScanner?.stopScan(scanCallback) }
    try {
      val socket = peer.device.createInsecureL2capChannel(peer.psm)
      socket.connect()
      return BluetoothConn(socket)
    } finally {
      // Scanning while connecting slows the link down; resume afterwards.
      main.post {
        if (scanning) {
          val filters = listOf(ScanFilter.Builder().setServiceUuid(ParcelUuid(serviceUuid)).build())
          val settings = ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build()
          runCatching { adapter?.bluetoothLeScanner?.startScan(filters, settings, scanCallback) }
        }
      }
    }
  }

  companion object {
    private const val TAG = "CrosshareBle"
  }
}
