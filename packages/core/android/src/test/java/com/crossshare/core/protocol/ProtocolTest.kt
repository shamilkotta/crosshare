package com.crossshare.core.protocol

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assume.assumeTrue
import org.junit.Test
import java.io.File
import java.io.FileOutputStream
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference
import kotlin.random.Random

/** Runs the Kotlin engine against itself and, if CS_CLI is set, against the Swift engine. */
class ProtocolTest {
  private val tmp = createTempDir("crossshare-test")

  private class DirStorage(private val dir: File) : IncomingStorage {
    override fun begin(transferId: String, files: List<Msg.WireFile>): IncomingSink {
      val parts = files.indices.map { File(dir, "$transferId-$it.part") }
      val streams = HashMap<Int, FileOutputStream>()
      parts.forEach { it.createNewFile() }
      return object : IncomingSink {
        override fun write(index: Int, data: ByteArray) {
          streams.getOrPut(index) { FileOutputStream(parts[index]) }.write(data)
        }
        override fun closeFile(index: Int) {
          streams.remove(index)?.close()
        }
        override fun finish(): List<String> {
          streams.values.forEach { it.close() }
          return files.mapIndexed { i, f ->
            val dest = File(dir, f.name)
            parts[i].renameTo(dest)
            dest.path
          }
        }
        override fun discard() {
          streams.values.forEach { it.close() }
          parts.forEach { it.delete() }
        }
      }
    }
  }

  /** Loopback stand-in for the hotspot and Wi-Fi Aware: hosts and joins on 127.0.0.1. */
  private class LoopbackUpgrade(
    override val canHost: Boolean,
    override val canJoin: Boolean,
    override val canAware: Boolean = false,
    private val awareJoinWorks: Boolean = true,
  ) : Upgrade {
    override fun host() =
      HostedNetwork(Msg("upgradeOffer", ssid = "TestNet", passphrase = "secret123", host = "127.0.0.1"), ServerSocket(0))
    override fun hostAware() =
      HostedNetwork(Msg("upgradeOffer", method = "aware", service = "crossshare-test", passphrase = "pw"), ServerSocket(0))
    override fun join(offer: Msg): Conn? {
      if (offer.method == "aware") {
        assertEquals("crossshare-test", offer.service)
        if (!awareJoinWorks) return null
      } else {
        assertEquals("TestNet", offer.ssid)
      }
      return SocketConn(Socket("127.0.0.1", offer.port!!))
    }
    override fun release() {}
  }

  private fun randomFile(name: String, size: Int): File =
    File(tmp, name).apply { writeBytes(Random.nextBytes(size)) }

  private fun outgoing(f: File) = OutgoingFile(f.name, f.length(), null) { f.inputStream() }

  private fun device(name: String) = LocalDevice("id-$name", name)

  /** Starts one incoming session on a fresh server socket and returns its port. */
  private fun listenOnce(
    outDir: File,
    accept: Boolean = true,
    upgrade: Upgrade = NoUpgrade,
    route: String = "wifi",
    result: AtomicReference<Transfer>,
    done: CountDownLatch,
  ): Int {
    val server = ServerSocket(0, 1, InetAddress.getLoopbackAddress())
    Thread {
      val socket = server.accept()
      lateinit var session: TransferSession
      session = TransferSession(
        "in", device("receiver"), "incoming", null, upgrade,
        onUpdate = { t ->
          if (t.status.isFinal) {
            result.set(t)
            done.countDown()
          }
        },
        onRequest = { session.respond(accept) },
      )
      session.startIncoming(SocketConn(socket), route, DirStorage(outDir))
      server.close()
    }.start()
    return server.localPort
  }

  private fun send(
    port: Int,
    files: List<File>,
    text: String? = null,
    upgrade: Upgrade = NoUpgrade,
    route: String = "wifi",
  ): Transfer {
    val done = CountDownLatch(1)
    val result = AtomicReference<Transfer>()
    val session = TransferSession(
      "out", device("sender"), "outgoing", null, upgrade,
      onUpdate = { t ->
        if (t.status.isFinal) {
          result.set(t)
          done.countDown()
        }
      },
    )
    session.startOutgoing(files.map(::outgoing), text, route) { SocketConn(Socket("127.0.0.1", port)) }
    check(done.await(60, TimeUnit.SECONDS)) { "send timed out" }
    return result.get()
  }

  @Test
  fun kotlinToKotlin() {
    val out = File(tmp, "out1").apply { mkdirs() }
    val files = listOf(randomFile("a.bin", 3_000_000), randomFile("empty.txt", 0), randomFile("b.txt", 10))
    val done = CountDownLatch(1)
    val received = AtomicReference<Transfer>()
    val port = listenOnce(out, result = received, done = done)
    val sent = send(port, files, text = "hello")
    assertEquals(TransferStatus.completed, sent.status)
    assert(done.await(10, TimeUnit.SECONDS))
    assertEquals(TransferStatus.completed, received.get().status)
    assertEquals("hello", received.get().text)
    for (f in files) assertArrayEquals(f.readBytes(), File(out, f.name).readBytes())
  }

  @Test
  fun decline() {
    val done = CountDownLatch(1)
    val received = AtomicReference<Transfer>()
    val port = listenOnce(File(tmp, "out2"), accept = false, result = received, done = done)
    assertEquals(TransferStatus.declined, send(port, listOf(randomFile("c.txt", 5))).status)
    assert(done.await(10, TimeUnit.SECONDS))
    assertEquals(TransferStatus.declined, received.get().status)
  }

  @Test
  fun upgradeSenderHosts() {
    val out = File(tmp, "out3").apply { mkdirs() }
    val file = randomFile("big.bin", 5_000_000)
    val done = CountDownLatch(1)
    val received = AtomicReference<Transfer>()
    val port = listenOnce(
      out, upgrade = LoopbackUpgrade(canHost = false, canJoin = true), route = "bluetooth",
      result = received, done = done,
    )
    val sent = send(port, listOf(file), upgrade = LoopbackUpgrade(canHost = true, canJoin = true), route = "bluetooth")
    assertEquals(TransferStatus.completed, sent.status)
    assertEquals("hotspot", sent.transport)
    assert(done.await(10, TimeUnit.SECONDS))
    assertEquals("hotspot", received.get().transport)
    assertArrayEquals(file.readBytes(), File(out, file.name).readBytes())
  }

  @Test
  fun upgradeReceiverHosts() {
    val out = File(tmp, "out4").apply { mkdirs() }
    val file = randomFile("big2.bin", 3_000_000)
    val done = CountDownLatch(1)
    val received = AtomicReference<Transfer>()
    val port = listenOnce(
      out, upgrade = LoopbackUpgrade(canHost = true, canJoin = false), route = "bluetooth",
      result = received, done = done,
    )
    val sent = send(port, listOf(file), upgrade = LoopbackUpgrade(canHost = false, canJoin = true), route = "bluetooth")
    assertEquals(TransferStatus.completed, sent.status)
    assertEquals("hotspot", sent.transport)
    assertArrayEquals(file.readBytes(), File(out, file.name).readBytes())
  }

  @Test
  fun upgradeAware() {
    val out = File(tmp, "out5").apply { mkdirs() }
    val file = randomFile("big3.bin", 3_000_000)
    val done = CountDownLatch(1)
    val received = AtomicReference<Transfer>()
    val port = listenOnce(
      out, upgrade = LoopbackUpgrade(canHost = true, canJoin = true, canAware = true), route = "bluetooth",
      result = received, done = done,
    )
    val sent = send(
      port, listOf(file), upgrade = LoopbackUpgrade(canHost = true, canJoin = true, canAware = true),
      route = "bluetooth",
    )
    assertEquals(TransferStatus.completed, sent.status)
    assertEquals("aware", sent.transport)
    assert(done.await(10, TimeUnit.SECONDS))
    assertEquals("aware", received.get().transport)
    assertArrayEquals(file.readBytes(), File(out, file.name).readBytes())
  }

  @Test
  fun upgradeAwareFallsBackToHotspot() {
    val out = File(tmp, "out6").apply { mkdirs() }
    val file = randomFile("big4.bin", 3_000_000)
    val done = CountDownLatch(1)
    val received = AtomicReference<Transfer>()
    val port = listenOnce(
      out, upgrade = LoopbackUpgrade(canHost = true, canJoin = true, canAware = true, awareJoinWorks = false),
      route = "bluetooth", result = received, done = done,
    )
    val sent = send(
      port, listOf(file), upgrade = LoopbackUpgrade(canHost = true, canJoin = true, canAware = true),
      route = "bluetooth",
    )
    assertEquals(TransferStatus.completed, sent.status)
    assertEquals("hotspot", sent.transport)
    assert(done.await(10, TimeUnit.SECONDS))
    assertEquals("hotspot", received.get().transport)
    assertArrayEquals(file.readBytes(), File(out, file.name).readBytes())
  }

  // Swift interop (needs CS_CLI pointing at packages/core/.build/debug/cs-cli)

  private val cli: String? = System.getProperty("csCli")?.takeIf { it.isNotEmpty() && File(it).exists() }

  @Test
  fun kotlinToSwift() {
    assumeTrue("CS_CLI not set", cli != null)
    val out = File(tmp, "swift-out").apply { mkdirs() }
    val port = 47100 + Random.nextInt(500)
    val proc = ProcessBuilder(cli, "listen", "--port", "$port", "--once", "--out", out.path)
      .redirectErrorStream(true).start()
    Thread.sleep(1500)
    val files = listOf(randomFile("k2s.bin", 2_500_000), randomFile("k2s-empty", 0))
    val sent = send(port, files, text = "from kotlin")
    val log = proc.inputStream.bufferedReader().readText()
    proc.waitFor(10, TimeUnit.SECONDS)
    println(log)
    assertEquals(TransferStatus.completed, sent.status)
    assert(log.contains("text=from kotlin"))
    for (f in files) assertArrayEquals(f.readBytes(), File(out, f.name).readBytes())
  }

  @Test
  fun swiftToKotlin() {
    assumeTrue("CS_CLI not set", cli != null)
    val out = File(tmp, "kotlin-out").apply { mkdirs() }
    val done = CountDownLatch(1)
    val received = AtomicReference<Transfer>()
    val port = listenOnce(out, result = received, done = done)
    val file = randomFile("s2k.bin", 4_000_000)
    val proc = ProcessBuilder(cli, "send", "--port", "$port", "--text", "from swift", file.path)
      .redirectErrorStream(true).start()
    val log = proc.inputStream.bufferedReader().readText()
    proc.waitFor(30, TimeUnit.SECONDS)
    println(log)
    assert(done.await(30, TimeUnit.SECONDS))
    assertEquals(TransferStatus.completed, received.get().status)
    assertEquals("from swift", received.get().text)
    assertArrayEquals(file.readBytes(), File(out, file.name).readBytes())
  }
}
