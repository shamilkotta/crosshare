package com.crosshare.core

import android.Manifest
import android.app.Notification
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.SystemClock
import androidx.core.app.NotificationChannelCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.crosshare.core.protocol.Transfer
import com.crosshare.core.protocol.TransferStatus
import java.util.concurrent.ConcurrentHashMap

/**
 * System notifications: the background service, incoming requests (with Accept / Decline) and
 * transfer progress. Each transfer has one notification (tagged with its id) that goes from
 * request to progress to result.
 */
object Notifications {
  const val SERVICE_ID = 1
  private const val TRANSFER_ID = 2

  private const val CHANNEL_SERVICE = "crosshare_service"
  private const val CHANNEL_REQUESTS = "crosshare_requests"
  private const val CHANNEL_PROGRESS = "crosshare_progress"
  private const val CHANNEL_RESULTS = "crosshare_results"

  private const val PROGRESS_INTERVAL_MS = 500L

  private val lastPosted = ConcurrentHashMap<String, Pair<TransferStatus, Long>>()
  private var channelsCreated = false

  fun service(context: Context): Notification {
    ensureChannels(context)
    val text = if (CrosshareRuntime.isVisible) "Visible to everyone nearby" else "Transferring files"
    return NotificationCompat.Builder(context, CHANNEL_SERVICE)
      .setSmallIcon(R.drawable.crosshare_notification)
      .setContentTitle("Crosshare")
      .setContentText(text)
      .setContentIntent(openApp(context))
      .setOngoing(true)
      .setShowWhen(false)
      .setPriority(NotificationCompat.PRIORITY_MIN)
      .setCategory(NotificationCompat.CATEGORY_SERVICE)
      .apply {
        if (CrosshareRuntime.isVisible) {
          addAction(0, "Turn off", action(context, NotificationActionReceiver.HIDE, null))
        }
      }
      .build()
  }

  fun refreshService(context: Context) {
    post(context, null, SERVICE_ID, service(context))
  }

  fun showRequest(context: Context, t: Transfer) {
    ensureChannels(context)
    val n = NotificationCompat.Builder(context, CHANNEL_REQUESTS)
      .setSmallIcon(R.drawable.crosshare_notification)
      .setContentTitle(
        when {
          t.kind != "link" -> "${t.peerName} wants to share"
          t.direction == "outgoing" -> "Confirm link with ${t.peerName}"
          else -> "${t.peerName} wants to link"
        },
      )
      .setContentText(describe(t))
      .setStyle(NotificationCompat.BigTextStyle().bigText(describe(t)))
      .setContentIntent(openApp(context))
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setCategory(NotificationCompat.CATEGORY_MESSAGE)
      .setOngoing(true)
      .addAction(0, if (t.kind == "link") "Cancel" else "Decline", action(context, NotificationActionReceiver.DECLINE, t.id))
      .addAction(0, if (t.kind == "link") "Codes match" else "Accept", action(context, NotificationActionReceiver.ACCEPT, t.id))
      .build()
    lastPosted[t.id] = t.status to SystemClock.elapsedRealtime()
    post(context, t.id, TRANSFER_ID, n)
  }

  fun onTransferUpdate(context: Context, t: Transfer) {
    if (t.kind == "unlink") return
    if (t.status.isFinal) {
      lastPosted.remove(t.id)
      val result = result(context, t)
      if (result == null) cancel(context, t.id) else post(context, t.id, TRANSFER_ID, result)
      return
    }
    // Incoming transfers only show up once accepted; the request notification covers "waiting".
    val show = t.direction == "outgoing" ||
      t.status == TransferStatus.transferring || t.status == TransferStatus.upgrading
    if (!show) return
    val now = SystemClock.elapsedRealtime()
    val last = lastPosted[t.id]
    if (last != null && last.first == t.status && now - last.second < PROGRESS_INTERVAL_MS) return
    lastPosted[t.id] = t.status to now
    post(context, t.id, TRANSFER_ID, progress(context, t))
  }

  fun cancel(context: Context, transferId: String) {
    NotificationManagerCompat.from(context).cancel(transferId, TRANSFER_ID)
  }

  private fun progress(context: Context, t: Transfer): Notification {
    ensureChannels(context)
    val incoming = t.direction == "incoming"
    val title = if (incoming) "Receiving from ${t.peerName}" else "Sending to ${t.peerName}"
    val total = t.totalBytes
    val done = t.transferredBytes
    val text = when (t.status) {
      TransferStatus.connecting -> "Connecting…"
      TransferStatus.waiting -> "Waiting for ${t.peerName} to accept"
      TransferStatus.upgrading -> "Switching to a faster connection…"
      else -> if (total > 0) "${formatSize(done)} of ${formatSize(total)}" else describe(t)
    }
    val determinate = t.status == TransferStatus.transferring && total > 0
    val percent = if (total > 0) ((done * 100) / total).toInt().coerceIn(0, 100) else 0
    return NotificationCompat.Builder(context, CHANNEL_PROGRESS)
      .setSmallIcon(if (incoming) android.R.drawable.stat_sys_download else android.R.drawable.stat_sys_upload)
      .setContentTitle(title)
      .setContentText(text)
      .setSubText(if (determinate) "$percent%" else null)
      .setProgress(100, percent, !determinate)
      .setContentIntent(openApp(context))
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setShowWhen(false)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setCategory(NotificationCompat.CATEGORY_PROGRESS)
      .addAction(0, "Cancel", action(context, NotificationActionReceiver.CANCEL, t.id))
      .build()
  }

  private fun result(context: Context, t: Transfer): Notification? {
    val incoming = t.direction == "incoming"
    val (title, text) = when (t.status) {
      TransferStatus.completed ->
        if (t.kind == "link") "Linked with ${t.peerName}" to "Text between you is now accepted automatically"
        else if (incoming && t.files.isEmpty()) "Copied from ${t.peerName}" to describe(t)
        else if (incoming) "Received from ${t.peerName}" to describe(t)
        else "Sent to ${t.peerName}" to describe(t)
      TransferStatus.failed ->
        (if (incoming) "Couldn't receive from ${t.peerName}" else "Couldn't send to ${t.peerName}") to
          (t.error ?: "The transfer failed")
      TransferStatus.declined -> if (incoming) return null else "${t.peerName} declined" to describe(t)
      else -> return null
    }
    ensureChannels(context)
    return NotificationCompat.Builder(context, CHANNEL_RESULTS)
      .setSmallIcon(if (incoming) android.R.drawable.stat_sys_download_done else android.R.drawable.stat_sys_upload_done)
      .setContentTitle(title)
      .setContentText(text)
      .setContentIntent(openApp(context))
      .setAutoCancel(true)
      .setPriority(NotificationCompat.PRIORITY_DEFAULT)
      .build()
  }

  private fun describe(t: Transfer): String {
    val files = t.files
    return when {
      t.kind == "link" -> "Check ${t.peerName} shows ${formatCode(t.code)}"
      files.isEmpty() -> t.text?.take(200) ?: "Text"
      files.size == 1 -> "${files[0].name} (${formatSize(files[0].size)})"
      else -> "${files.size} files (${formatSize(t.totalBytes)})"
    }
  }

  fun formatCode(code: String?) = code?.let { "${it.take(3)} ${it.drop(3)}" } ?: ""

  private fun formatSize(bytes: Long): String = when {
    bytes < 1024 -> "$bytes B"
    bytes < 1024 * 1024 -> "${bytes / 1024} KB"
    bytes < 1024L * 1024 * 1024 -> String.format("%.1f MB", bytes / (1024.0 * 1024))
    else -> String.format("%.2f GB", bytes / (1024.0 * 1024 * 1024))
  }

  private fun openApp(context: Context): PendingIntent? {
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return null
    launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
    return PendingIntent.getActivity(
      context, 0, launch, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  private fun action(context: Context, action: String, transferId: String?): PendingIntent {
    val intent = Intent(context, NotificationActionReceiver::class.java)
      .setAction(action)
      .putExtra(NotificationActionReceiver.EXTRA_TRANSFER_ID, transferId)
    return PendingIntent.getBroadcast(
      context, "$action:$transferId".hashCode(), intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  private fun post(context: Context, tag: String?, id: Int, n: Notification) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
      ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
    ) return
    runCatching { NotificationManagerCompat.from(context).notify(tag, id, n) }
  }

  @Synchronized
  private fun ensureChannels(context: Context) {
    if (channelsCreated) return
    channelsCreated = true
    val channel = { id: String, name: String, importance: Int, description: String ->
      NotificationChannelCompat.Builder(id, importance).setName(name).setDescription(description).build()
    }
    NotificationManagerCompat.from(context).createNotificationChannelsCompat(
      listOf(
        channel(CHANNEL_REQUESTS, "Incoming requests", NotificationManagerCompat.IMPORTANCE_HIGH,
          "Someone nearby wants to share with you"),
        channel(CHANNEL_PROGRESS, "Transfer progress", NotificationManagerCompat.IMPORTANCE_LOW,
          "Progress of files being sent or received"),
        channel(CHANNEL_RESULTS, "Completed transfers", NotificationManagerCompat.IMPORTANCE_DEFAULT,
          "Finished, failed and declined transfers"),
        channel(CHANNEL_SERVICE, "Visibility", NotificationManagerCompat.IMPORTANCE_MIN,
          "Shown while Crosshare is visible to nearby devices"),
      ),
    )
  }
}
