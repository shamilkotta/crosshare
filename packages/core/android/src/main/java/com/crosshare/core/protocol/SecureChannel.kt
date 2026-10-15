package com.crosshare.core.protocol

import java.io.BufferedOutputStream
import java.io.DataInputStream
import java.io.InputStream
import java.io.OutputStream
import java.math.BigInteger
import java.net.Socket
import java.nio.ByteBuffer
import java.security.KeyFactory
import java.security.KeyPairGenerator
import java.security.MessageDigest
import java.security.interfaces.ECPublicKey
import java.security.spec.ECGenParameterSpec
import java.security.spec.ECPoint
import java.security.spec.ECPublicKeySpec
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.TimeUnit
import javax.crypto.Cipher
import javax.crypto.KeyAgreement
import javax.crypto.Mac
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/** A reliable byte stream: a TCP socket or a Bluetooth L2CAP socket. */
interface Conn {
  val input: InputStream
  val output: OutputStream
  fun close()
}

class SocketConn(private val socket: Socket) : Conn {
  init {
    socket.tcpNoDelay = true
  }
  override val input: InputStream = socket.getInputStream()
  override val output: OutputStream = socket.getOutputStream()
  override fun close() {
    runCatching { socket.close() }
  }
}

sealed class Frame {
  class Message(val msg: Msg) : Frame()
  class Data(val bytes: ByteArray) : Frame()
}

/** Encrypted, framed messages over a Conn. See docs/PROTOCOL.md. */
class SecureChannel private constructor(
  val conn: Conn,
  private val sendKey: SecretKeySpec,
  private val recvKey: SecretKeySpec,
) {
  private val input = DataInputStream(conn.input)
  private val output = BufferedOutputStream(conn.output, 64 * 1024)
  private var sendCounter = 0L
  private var recvCounter = 0L
  @Volatile private var closed = false

  // A single reader thread feeds this queue; everyone else polls it.
  private val frames = ArrayBlockingQueue<Result<Frame>>(16)
  private var reader: Thread? = null

  companion object {
    private val MAGIC = "CSH1".toByteArray()
    private const val FRAME_MESSAGE: Byte = 1
    private const val FRAME_DATA: Byte = 2

    fun establish(conn: Conn, initiator: Boolean): SecureChannel {
      val kpg = KeyPairGenerator.getInstance("EC")
      kpg.initialize(ECGenParameterSpec("secp256r1"))
      val kp = kpg.generateKeyPair()
      val ownPub = encodePoint(kp.public as ECPublicKey)
      conn.output.write(MAGIC + ownPub)
      conn.output.flush()

      val hello = ByteArray(4 + 65)
      DataInputStream(conn.input).readFully(hello)
      if (!hello.copyOfRange(0, 4).contentEquals(MAGIC)) throw ProtocolException("bad handshake magic")
      val peerPub = hello.copyOfRange(4, 69)
      val peerKey = decodePoint(peerPub, kp.public as ECPublicKey)

      val ka = KeyAgreement.getInstance("ECDH")
      ka.init(kp.private)
      ka.doPhase(peerKey, true)
      val shared = ka.generateSecret()

      val iPub = if (initiator) ownPub else peerPub
      val rPub = if (initiator) peerPub else ownPub
      val salt = MessageDigest.getInstance("SHA-256").digest(iPub + rPub)
      val i2r = hkdf(shared, salt, "crosshare/v1/i2r")
      val r2i = hkdf(shared, salt, "crosshare/v1/r2i")
      return SecureChannel(
        conn,
        SecretKeySpec(if (initiator) i2r else r2i, "AES"),
        SecretKeySpec(if (initiator) r2i else i2r, "AES"),
      )
    }

    private fun hmac(key: ByteArray, data: ByteArray): ByteArray {
      val mac = Mac.getInstance("HmacSHA256")
      mac.init(SecretKeySpec(key, "HmacSHA256"))
      return mac.doFinal(data)
    }

    fun hkdf(ikm: ByteArray, salt: ByteArray, info: String): ByteArray {
      val prk = hmac(salt, ikm)
      return hmac(prk, info.toByteArray() + byteArrayOf(1)).copyOf(32)
    }

    private fun fixed32(n: BigInteger): ByteArray {
      val raw = n.toByteArray()
      return when {
        raw.size == 32 -> raw
        raw.size > 32 -> raw.copyOfRange(raw.size - 32, raw.size)
        else -> ByteArray(32 - raw.size) + raw
      }
    }

    fun encodePoint(key: ECPublicKey): ByteArray =
      byteArrayOf(4) + fixed32(key.w.affineX) + fixed32(key.w.affineY)

    private fun decodePoint(bytes: ByteArray, template: ECPublicKey): ECPublicKey {
      if (bytes.size != 65 || bytes[0] != 4.toByte()) throw ProtocolException("bad public key")
      val x = BigInteger(1, bytes.copyOfRange(1, 33))
      val y = BigInteger(1, bytes.copyOfRange(33, 65))
      val spec = ECPublicKeySpec(ECPoint(x, y), template.params)
      return KeyFactory.getInstance("EC").generatePublic(spec) as ECPublicKey
    }

    private fun nonce(counter: Long): ByteArray =
      ByteBuffer.allocate(12).putInt(0).putLong(counter).array()
  }

  // Sending

  @Synchronized
  private fun sendFrame(type: Byte, body: ByteArray, length: Int = body.size) {
    val plain = ByteArray(length + 1)
    plain[0] = type
    System.arraycopy(body, 0, plain, 1, length)
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.ENCRYPT_MODE, sendKey, GCMParameterSpec(128, nonce(sendCounter)))
    sendCounter++
    val sealed = cipher.doFinal(plain)
    output.write(ByteBuffer.allocate(4).putInt(sealed.size).array())
    output.write(sealed)
    output.flush()
  }

  fun send(msg: Msg) = sendFrame(FRAME_MESSAGE, msg.toJson())

  fun sendData(bytes: ByteArray, length: Int = bytes.size) = sendFrame(FRAME_DATA, bytes, length)

  // Receiving

  private fun readFrame(): Frame {
    val len = input.readInt()
    if (len < 17 || len > Constants.MAX_FRAME) throw ProtocolException("bad frame length $len")
    val sealed = ByteArray(len)
    input.readFully(sealed)
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.DECRYPT_MODE, recvKey, GCMParameterSpec(128, nonce(recvCounter)))
    recvCounter++
    val plain = cipher.doFinal(sealed)
    if (plain.isEmpty()) throw ProtocolException("empty frame")
    val body = plain.copyOfRange(1, plain.size)
    return when (plain[0]) {
      FRAME_MESSAGE -> Frame.Message(Msg.parse(body))
      FRAME_DATA -> Frame.Data(body)
      else -> throw ProtocolException("unknown frame type ${plain[0]}")
    }
  }

  /** Starts the reader thread. Call once, right after establish(). */
  fun startReader(): SecureChannel {
    reader = Thread({
      while (true) {
        val result = runCatching { readFrame() }
        try {
          frames.put(result)
        } catch (_: InterruptedException) {
          return@Thread
        }
        if (result.isFailure) return@Thread
      }
    }, "crosshare-reader").apply {
      isDaemon = true
      start()
    }
    return this
  }

  /** Next frame, or null if none arrives within `timeoutMs`. Throws if the stream failed. */
  fun poll(timeoutMs: Long): Frame? {
    val r = frames.poll(timeoutMs, TimeUnit.MILLISECONDS) ?: return null
    return r.getOrElse { if (closed) throw CancelledException() else throw it }
  }

  fun receive(timeoutMs: Long): Frame =
    poll(timeoutMs) ?: throw java.util.concurrent.TimeoutException("Timed out")

  /** Next frame, which must be a message. A "cancel" message throws CancelledException. */
  fun receiveMessage(timeoutMs: Long): Msg {
    val frame = receive(timeoutMs)
    if (frame !is Frame.Message) throw ProtocolException("expected a message, got data")
    if (frame.msg.t == "cancel") throw CancelledException()
    return frame.msg
  }

  fun close() {
    closed = true
    conn.close()
    reader?.interrupt()
  }
}
