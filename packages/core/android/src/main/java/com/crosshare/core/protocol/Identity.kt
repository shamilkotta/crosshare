package com.crosshare.core.protocol

import java.security.KeyFactory
import java.security.KeyPairGenerator
import java.security.PrivateKey
import java.security.Signature
import java.security.interfaces.ECPublicKey
import java.security.spec.ECGenParameterSpec
import java.security.spec.PKCS8EncodedKeySpec

/** This device's long-term identity key. See "Linked devices" in docs/PROTOCOL.md. */
class Identity(private val privateKey: PrivateKey, publicKey: ECPublicKey) {
  /** Uncompressed public key, hex. */
  val publicKey: String = SecureChannel.encodePoint(publicKey).hex()

  /** PKCS#8 private key, for saving. */
  val privateBytes: ByteArray get() = privateKey.encoded

  /** Signs the handshake transcript, binding this identity to the encrypted channel. */
  fun sign(transcript: ByteArray, initiator: Boolean): String {
    val s = Signature.getInstance("SHA256withECDSA")
    s.initSign(privateKey)
    s.update(signed(transcript, initiator))
    return s.sign().hex()
  }

  companion object {
    private val AUTH_LABEL = "crosshare/v1/auth".toByteArray()

    fun generate(): Identity {
      val kpg = KeyPairGenerator.getInstance("EC")
      kpg.initialize(ECGenParameterSpec("secp256r1"))
      val kp = kpg.generateKeyPair()
      return Identity(kp.private, kp.public as ECPublicKey)
    }

    fun restore(privateBytes: ByteArray, publicKey: String): Identity? = runCatching {
      val priv = KeyFactory.getInstance("EC").generatePrivate(PKCS8EncodedKeySpec(privateBytes))
      Identity(priv, SecureChannel.decodePoint(publicKey.unhex()!!))
    }.getOrNull()

    /** The peer's key if its hello carries a valid signature for this handshake, else null. */
    fun verify(hello: Msg, transcript: ByteArray, initiator: Boolean): String? = runCatching {
      val key = SecureChannel.decodePoint(hello.key!!.unhex()!!)
      val s = Signature.getInstance("SHA256withECDSA")
      s.initVerify(key)
      s.update(signed(transcript, initiator))
      if (s.verify(hello.sig!!.unhex()!!)) hello.key else null
    }.getOrNull()

    /**
     * The code both devices show while linking. Mixes in a nonce from each side; the initiator
     * commits to its nonce first, so a device in the middle can't steer both codes to match.
     */
    fun code(
      transcript: ByteArray, initiatorKey: String, responderKey: String, initiatorNonce: ByteArray,
      responderNonce: ByteArray,
    ): String {
      val input = "crosshare/v1/code".toByteArray() + transcript + initiatorKey.unhex()!! + responderKey.unhex()!! +
        initiatorNonce + responderNonce
      val h = sha256(input)
      val n = ((h[0].toLong() and 0xff) shl 24) or ((h[1].toLong() and 0xff) shl 16) or
        ((h[2].toLong() and 0xff) shl 8) or (h[3].toLong() and 0xff)
      return "%06d".format(n % 1_000_000)
    }

    fun nonce(): ByteArray = ByteArray(32).also { java.security.SecureRandom().nextBytes(it) }

    fun commitment(nonce: ByteArray): String = sha256(nonce).hex()

    private fun sha256(b: ByteArray) = java.security.MessageDigest.getInstance("SHA-256").digest(b)

    private fun signed(transcript: ByteArray, initiator: Boolean) =
      AUTH_LABEL + transcript + (if (initiator) "i" else "r").toByteArray()
  }
}

/** Identity and linked devices, as the session sees them. Implemented by the app; tests use NoTrust. */
interface Trust {
  val identity: Identity?
  fun isLinked(peerId: String): Boolean
  /** Linked, and proved it holds the key we saved for it. */
  fun isTrusted(peerId: String, key: String?): Boolean
  fun link(device: LinkedDevice)
  /** After a verified hello: drop the link if the peer no longer has us linked, else refresh its name. */
  fun observe(peerId: String, name: String, platform: String, key: String?, theyLinkUs: Boolean?)
}

object NoTrust : Trust {
  override val identity: Identity? = null
  override fun isLinked(peerId: String) = false
  override fun isTrusted(peerId: String, key: String?) = false
  override fun link(device: LinkedDevice) {}
  override fun observe(peerId: String, name: String, platform: String, key: String?, theyLinkUs: Boolean?) {}
}

fun ByteArray.hex(): String = joinToString("") { "%02x".format(it) }

fun String.unhex(): ByteArray? {
  if (length % 2 != 0) return null
  return runCatching { ByteArray(length / 2) { i -> substring(i * 2, i * 2 + 2).toInt(16).toByte() } }.getOrNull()
}
