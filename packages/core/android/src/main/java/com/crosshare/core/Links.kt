package com.crosshare.core

import android.content.Context
import com.crosshare.core.protocol.Identity
import com.crosshare.core.protocol.LinkedDevice
import com.crosshare.core.protocol.Trust
import org.json.JSONArray
import org.json.JSONObject

/** This device's identity key and the devices it is linked with, saved in app-private preferences. */
class Links(context: Context, private val onChange: (List<LinkedDevice>) -> Unit) : Trust {
  private val prefs = context.getSharedPreferences("crosshare", Context.MODE_PRIVATE)
  private val links = mutableMapOf<String, LinkedDevice>()

  override val identity: Identity = loadIdentity()

  init {
    runCatching {
      val arr = JSONArray(prefs.getString("links", "[]"))
      for (i in 0 until arr.length()) {
        val o = arr.getJSONObject(i)
        val d = LinkedDevice(o.getString("id"), o.getString("name"), o.getString("platform"), o.getString("key"))
        links[d.id] = d
      }
    }
  }

  private fun loadIdentity(): Identity {
    val priv = prefs.getString("identityPrivate", null)
    val pub = prefs.getString("identityPublic", null)
    if (priv != null && pub != null) {
      android.util.Base64.decode(priv, android.util.Base64.NO_WRAP)
        .let { Identity.restore(it, pub) }
        ?.let { return it }
    }
    return Identity.generate().also {
      prefs.edit()
        .putString("identityPrivate", android.util.Base64.encodeToString(it.privateBytes, android.util.Base64.NO_WRAP))
        .putString("identityPublic", it.publicKey)
        .apply()
    }
  }

  val all: List<LinkedDevice> get() = synchronized(links) { links.values.sortedBy { it.name.lowercase() } }

  override fun isLinked(peerId: String) = synchronized(links) { peerId in links }

  override fun isTrusted(peerId: String, key: String?) = key != null && synchronized(links) { links[peerId]?.key == key }

  override fun link(device: LinkedDevice) = update { it[device.id] = device }

  fun unlink(id: String): LinkedDevice? {
    var removed: LinkedDevice? = null
    update { removed = it.remove(id) }
    return removed
  }

  override fun observe(peerId: String, name: String, platform: String, key: String?, theyLinkUs: Boolean?) {
    val current = synchronized(links) { links[peerId] } ?: return
    if (key == null || current.key != key) return
    if (theyLinkUs == false) unlink(peerId)
    else if (current.name != name || current.platform != platform) {
      update { it[peerId] = current.copy(name = name, platform = platform) }
    }
  }

  private fun update(change: (MutableMap<String, LinkedDevice>) -> Unit) {
    val changed = synchronized(links) {
      val before = links.toMap()
      change(links)
      if (links == before) return@synchronized false
      val arr = JSONArray()
      links.values.forEach {
        arr.put(JSONObject().put("id", it.id).put("name", it.name).put("platform", it.platform).put("key", it.key))
      }
      prefs.edit().putString("links", arr.toString()).apply()
      true
    }
    if (changed) onChange(all)
  }
}
