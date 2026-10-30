package com.crosshare.core.protocol

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference

/** Linked devices: signed hellos, linking, auto-accepted text and unlinking from either side. */
class LinkTest {
  private class MemoryTrust(override val identity: Identity = Identity.generate()) : Trust {
    val links = mutableMapOf<String, LinkedDevice>()
    override fun isLinked(peerId: String) = peerId in links
    override fun isTrusted(peerId: String, key: String?) = key != null && links[peerId]?.key == key
    override fun link(device: LinkedDevice) {
      links[device.id] = device
    }
    override fun observe(peerId: String, name: String, platform: String, key: String?, theyLinkUs: Boolean?) {
      if (key != null && links[peerId]?.key == key && theyLinkUs == false) links.remove(peerId)
    }
  }

  private val noFiles = object : IncomingStorage {
    override fun begin(transferId: String, files: List<Msg.WireFile>) = object : IncomingSink {
      override fun write(index: Int, data: ByteArray) {}
      override fun closeFile(index: Int) {}
      override fun finish() = emptyList<String>()
      override fun discard() {}
    }
  }

  private val sender = LocalDevice("id-sender", "Sender")
  private val receiver = LocalDevice("id-receiver", "Receiver")

  /** Runs one exchange. Returns (sender result, receiver result, whether the receiver was prompted). */
  private fun exchange(
    senderTrust: Trust,
    receiverTrust: Trust,
    text: String? = null,
    kind: String = "transfer",
    accept: Boolean = true,
    senderConfirms: Boolean = true,
    from: LocalDevice = sender,
  ): Triple<Transfer, Transfer, Boolean> {
    val server = ServerSocket(0, 1, InetAddress.getLoopbackAddress())
    val done = CountDownLatch(2)
    val inResult = AtomicReference<Transfer>()
    val outResult = AtomicReference<Transfer>()
    val prompted = AtomicBoolean(false)
    Thread {
      val socket = server.accept()
      lateinit var session: TransferSession
      session = TransferSession(
        "in", receiver, "incoming", null, NoUpgrade,
        onUpdate = { t ->
          if (t.status.isFinal) {
            inResult.set(t)
            done.countDown()
          }
        },
        onRequest = {
          prompted.set(true)
          session.respond(accept)
        },
        trust = receiverTrust,
      )
      session.startIncoming(SocketConn(socket), "wifi", noFiles)
      server.close()
    }.start()

    val peer = Peer(receiver.id, receiver.name, "android", emptyList())
    lateinit var out: TransferSession
    out = TransferSession(
      "out", from, "outgoing", peer, NoUpgrade,
      onUpdate = { t ->
        if (t.status.isFinal) {
          outResult.set(t)
          done.countDown()
        }
      },
      // Link requests: this user compares the code and confirms.
      onRequest = { out.respond(senderConfirms) },
      trust = senderTrust,
    )
    out.startOutgoing(emptyList(), text, "wifi", kind) { SocketConn(Socket("127.0.0.1", server.localPort)) }
    assertTrue("timed out", done.await(30, TimeUnit.SECONDS))
    return Triple(outResult.get(), inResult.get(), prompted.get())
  }

  private fun linkBoth(): Pair<MemoryTrust, MemoryTrust> {
    val a = MemoryTrust()
    val b = MemoryTrust()
    val (out, inc, prompted) = exchange(a, b, kind = "link")
    assertTrue(prompted)
    assertEquals(TransferStatus.completed, out.status)
    assertEquals("link", inc.kind)
    assertTrue(inc.code!!.matches(Regex("\\d{6}")))
    assertEquals(inc.code, out.code)
    assertEquals(b.identity.publicKey, a.links[receiver.id]?.key)
    assertEquals(a.identity.publicKey, b.links[sender.id]?.key)
    return a to b
  }

  @Test
  fun declinedLinkSavesNothing() {
    val a = MemoryTrust()
    val b = MemoryTrust()
    val (out, _, _) = exchange(a, b, kind = "link", accept = false)
    assertEquals(TransferStatus.declined, out.status)
    assertTrue(a.links.isEmpty() && b.links.isEmpty())
  }

  @Test
  fun senderRejectingTheCodeSavesNothing() {
    val a = MemoryTrust()
    val b = MemoryTrust()
    val (out, inc, _) = exchange(a, b, kind = "link", senderConfirms = false)
    assertEquals(TransferStatus.cancelled, out.status)
    assertEquals(TransferStatus.cancelled, inc.status)
    assertTrue(a.links.isEmpty() && b.links.isEmpty())
  }

  @Test
  fun codeDependsOnBothNonces() {
    val t = ByteArray(32)
    val k = Identity.generate().publicKey
    val n1 = Identity.nonce()
    val n2 = Identity.nonce()
    assertEquals(Identity.code(t, k, k, n1, n2), Identity.code(t, k, k, n1, n2))
    assertTrue(Identity.code(t, k, k, n1, n2) != Identity.code(t, k, k, n1, Identity.nonce()))
  }

  @Test
  fun linkedTextIsAcceptedWithoutAsking() {
    val (a, b) = linkBoth()
    val (out, inc, prompted) = exchange(a, b, text = "from the clipboard", accept = false)
    assertFalse(prompted)
    assertEquals(TransferStatus.completed, out.status)
    assertTrue(inc.trusted)
    assertEquals("from the clipboard", inc.text)
  }

  @Test
  fun unlinkedTextStillAsks() {
    val (out, inc, prompted) = exchange(MemoryTrust(), MemoryTrust(), text = "hi", accept = false)
    assertTrue(prompted)
    assertFalse(inc.trusted)
    assertEquals(TransferStatus.declined, out.status)
  }

  @Test
  fun impostorWithTheSameIdIsNotTrusted() {
    val (_, b) = linkBoth()
    // Same device id and name, different key.
    val (_, inc, prompted) = exchange(MemoryTrust(), b, text = "hi", accept = false)
    assertTrue(prompted)
    assertFalse(inc.trusted)
    assertTrue(sender.id in b.links)
  }

  @Test
  fun unlinkFromEitherSide() {
    val (a, b) = linkBoth()
    // The sender removes the link while the receiver is away; the next contact drops the receiver's side.
    a.links.remove(receiver.id)
    val (_, inc, prompted) = exchange(a, b, text = "hi", accept = false)
    assertTrue(prompted)
    assertFalse(inc.trusted)
    assertTrue(b.links.isEmpty())
  }

  @Test
  fun unlinkMessageIsSilent() {
    val (a, b) = linkBoth()
    a.links.remove(receiver.id)
    val (_, inc, prompted) = exchange(a, b, kind = "unlink")
    assertFalse(prompted)
    assertEquals("unlink", inc.kind)
    assertTrue(b.links.isEmpty())
  }
}
