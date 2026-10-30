package com.crosshare.core

import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.content.ContextCompat

/** Keeps the process alive so requests can arrive and transfers finish with the app closed. */
class CrosshareService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    CrosshareRuntime.init(this)
    val notification = Notifications.service(this)
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        startForeground(Notifications.SERVICE_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE)
      } else {
        startForeground(Notifications.SERVICE_ID, notification)
      }
    } catch (e: Exception) {
      Log.w(TAG, "Could not start in the foreground", e)
      running = false
      stopSelf()
      return START_NOT_STICKY
    }
    running = true
    // Restarted by the system after the process died: bring the engine back up.
    if (intent == null) CrosshareRuntime.restore()
    return START_STICKY
  }

  override fun onDestroy() {
    running = false
    super.onDestroy()
  }

  companion object {
    private const val TAG = "CrosshareService"

    @Volatile private var running = false

    fun start(context: Context) {
      if (running) return
      running = true
      try {
        ContextCompat.startForegroundService(context, Intent(context, CrosshareService::class.java))
      } catch (e: Exception) {
        // Android 12+ refuses to start foreground services from the background in some cases.
        // The engine still works while the process is alive.
        Log.w(TAG, "Could not start service", e)
        running = false
      }
    }

    fun stop(context: Context) {
      if (!running) return
      running = false
      context.stopService(Intent(context, CrosshareService::class.java))
    }
  }
}
