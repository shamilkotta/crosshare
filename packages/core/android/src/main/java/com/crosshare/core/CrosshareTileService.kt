package com.crosshare.core

import android.annotation.SuppressLint
import android.app.PendingIntent
import android.content.Intent
import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService

/** Quick Settings tile that toggles "Everyone" visibility. */
class CrosshareTileService : TileService() {
  override fun onStartListening() {
    CrosshareRuntime.init(this)
    render()
  }

  override fun onClick() {
    CrosshareRuntime.init(this)
    val on = !CrosshareRuntime.isVisible
    // Bluetooth and nearby Wi-Fi permissions can only be granted from the app.
    if (on && !CrosshareRuntime.hasPermissions()) {
      openApp()
      return
    }
    CrosshareRuntime.setVisible(on)
    render()
  }

  private fun render() {
    val tile = qsTile ?: return
    val on = CrosshareRuntime.isVisible
    tile.state = if (on) Tile.STATE_ACTIVE else Tile.STATE_INACTIVE
    tile.label = "Crosshare"
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) tile.subtitle = if (on) "Everyone" else "Off"
    tile.contentDescription = if (on) "Crosshare, visible to everyone" else "Crosshare, off"
    tile.updateTile()
  }

  @SuppressLint("StartActivityAndCollapseDeprecated")
  private fun openApp() {
    val launch = packageManager.getLaunchIntentForPackage(packageName) ?: return
    launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    if (Build.VERSION.SDK_INT >= 34) {
      startActivityAndCollapse(PendingIntent.getActivity(this, 0, launch, PendingIntent.FLAG_IMMUTABLE))
    } else {
      @Suppress("DEPRECATION")
      startActivityAndCollapse(launch)
    }
  }
}
