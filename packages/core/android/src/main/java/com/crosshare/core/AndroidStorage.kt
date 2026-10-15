package com.crosshare.core

import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.webkit.MimeTypeMap
import com.crosshare.core.protocol.IncomingSink
import com.crosshare.core.protocol.IncomingStorage
import com.crosshare.core.protocol.Msg
import java.io.File
import java.io.OutputStream

/**
 * Saves received files to Downloads/Crosshare. On Android 10+ files go through MediaStore
 * (no storage permission) and stay hidden until complete; older versions use app-specific storage.
 */
class AndroidStorage(private val context: Context) : IncomingStorage {
  override fun begin(transferId: String, files: List<Msg.WireFile>): IncomingSink =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) MediaStoreSink(files) else FileSink(files)

  private fun sanitize(name: String): String {
    val base = name.substringAfterLast('/').replace(':', '_').trim()
    return if (base.isEmpty() || base == "." || base == "..") "file" else base.take(200)
  }

  private fun mimeFor(file: Msg.WireFile): String =
    file.mime
      ?: MimeTypeMap.getSingleton().getMimeTypeFromExtension(file.name.substringAfterLast('.', "").lowercase())
      ?: "application/octet-stream"

  private inner class MediaStoreSink(files: List<Msg.WireFile>) : IncomingSink {
    private val resolver = context.contentResolver
    private val uris: List<Uri>
    private val streams = HashMap<Int, OutputStream>()

    init {
      val created = ArrayList<Uri>()
      try {
        for (f in files) {
          val values = ContentValues().apply {
            put(MediaStore.Downloads.DISPLAY_NAME, sanitize(f.name))
            put(MediaStore.Downloads.MIME_TYPE, mimeFor(f))
            put(MediaStore.Downloads.RELATIVE_PATH, "${Environment.DIRECTORY_DOWNLOADS}/Crosshare")
            put(MediaStore.Downloads.IS_PENDING, 1)
          }
          created += resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
            ?: throw IllegalStateException("Could not create ${f.name}")
        }
      } catch (e: Exception) {
        created.forEach { runCatching { resolver.delete(it, null, null) } }
        throw e
      }
      uris = created
    }

    override fun write(index: Int, data: ByteArray) {
      val out = streams.getOrPut(index) {
        resolver.openOutputStream(uris[index]) ?: throw IllegalStateException("Could not open file")
      }
      out.write(data)
    }

    override fun closeFile(index: Int) {
      streams.remove(index)?.close()
    }

    override fun finish(): List<String> {
      streams.values.forEach { runCatching { it.close() } }
      streams.clear()
      for (uri in uris) {
        resolver.update(uri, ContentValues().apply { put(MediaStore.Downloads.IS_PENDING, 0) }, null, null)
      }
      return uris.map { it.toString() }
    }

    override fun discard() {
      streams.values.forEach { runCatching { it.close() } }
      streams.clear()
      uris.forEach { runCatching { resolver.delete(it, null, null) } }
    }
  }

  private inner class FileSink(private val files: List<Msg.WireFile>) : IncomingSink {
    private val dir = File(context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "Crosshare")
    private val parts = files.indices.map { File(context.cacheDir, "crosshare-$it-${System.nanoTime()}.part") }
    private val streams = HashMap<Int, OutputStream>()

    init {
      parts.forEach { it.createNewFile() }
    }

    override fun write(index: Int, data: ByteArray) {
      streams.getOrPut(index) { parts[index].outputStream() }.write(data)
    }

    override fun closeFile(index: Int) {
      streams.remove(index)?.close()
    }

    override fun finish(): List<String> {
      streams.values.forEach { runCatching { it.close() } }
      streams.clear()
      dir.mkdirs()
      return files.mapIndexed { i, f ->
        val dest = unique(File(dir, sanitize(f.name)))
        if (!parts[i].renameTo(dest)) {
          parts[i].copyTo(dest)
          parts[i].delete()
        }
        Uri.fromFile(dest).toString()
      }
    }

    override fun discard() {
      streams.values.forEach { runCatching { it.close() } }
      streams.clear()
      parts.forEach { it.delete() }
    }

    private fun unique(file: File): File {
      if (!file.exists()) return file
      val stem = file.nameWithoutExtension
      val ext = file.extension.let { if (it.isEmpty()) "" else ".$it" }
      var n = 1
      while (true) {
        val candidate = File(file.parentFile, "$stem ($n)$ext")
        if (!candidate.exists()) return candidate
        n++
      }
    }
  }
}
