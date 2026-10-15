package com.crossshare.core

import android.content.Context
import com.crossshare.core.protocol.Conn
import com.crossshare.core.protocol.HostedNetwork
import com.crossshare.core.protocol.Msg
import com.crossshare.core.protocol.Upgrade

/** Bandwidth upgrade for Bluetooth transfers: Wi-Fi Aware with other Android phones, else a hotspot. */
class NetworkUpgrade(context: Context, permitted: () -> Boolean) : Upgrade {
  private val hotspot = HotspotUpgrade(context, permitted)
  private val aware = AwareLink(context, permitted)

  override val canHost get() = hotspot.canHost
  override val canJoin get() = hotspot.canJoin
  override val canAware get() = aware.isAvailable

  override fun host() = hotspot.host()

  override fun hostAware(): HostedNetwork? = aware.host()

  override fun join(offer: Msg): Conn? {
    if (offer.method == "aware") {
      return aware.join(offer.service ?: return null, offer.passphrase ?: return null)
    }
    return hotspot.join(
      offer.ssid ?: return null, offer.passphrase ?: "", offer.host ?: return null, offer.port ?: return null,
    )
  }

  override fun release() {
    hotspot.release()
    aware.release()
  }
}
