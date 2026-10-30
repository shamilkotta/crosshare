package com.crosshare.core

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Handles notification buttons without opening the app. */
class NotificationActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    CrosshareRuntime.init(context)
    val id = intent.getStringExtra(EXTRA_TRANSFER_ID)
    when (intent.action) {
      ACCEPT -> id?.let { CrosshareRuntime.engine().respond(it, true) }
      DECLINE -> id?.let {
        CrosshareRuntime.engine().respond(it, false)
        Notifications.cancel(context, it)
      }
      CANCEL -> id?.let {
        CrosshareRuntime.engine().cancel(it)
        Notifications.cancel(context, it)
      }
      HIDE -> CrosshareRuntime.setVisible(false)
    }
  }

  companion object {
    const val ACCEPT = "com.crosshare.core.ACCEPT"
    const val DECLINE = "com.crosshare.core.DECLINE"
    const val CANCEL = "com.crosshare.core.CANCEL"
    const val HIDE = "com.crosshare.core.HIDE"
    const val EXTRA_TRANSFER_ID = "transferId"
  }
}
