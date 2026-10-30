package com.crosshare.core.protocol

import java.net.ServerSocket
import java.net.SocketTimeoutException
import java.security.SecureRandom

/**
 * A link this device hosts for a bandwidth upgrade: the method-specific `upgradeOffer` fields
 * (ssid/host for a hotspot, service for Wi-Fi Aware, plus passphrase) and the socket the joiner connects to.
 */
class HostedNetwork(val offer: Msg, val server: ServerSocket)

/** Platform hooks for the bandwidth upgrade. One instance per session. */
interface Upgrade {
  /** Can start a hotspot. */
  val canHost: Boolean
  /** Can join a hotspot. */
  val canJoin: Boolean
  /** Can host and join Wi-Fi Aware links (Android to Android only). */
  val canAware: Boolean get() = false
  /** Starts a hotspot and a server socket on it. Blocking; null on failure. */
  fun host(): HostedNetwork?
  /** Publishes a Wi-Fi Aware service and a server socket for it. Blocking; null on failure. */
  fun hostAware(): HostedNetwork? = null
  /** Joins the network described by an `upgradeOffer` and connects to the host. Blocking; null on failure. */
  fun join(offer: Msg): Conn?
  /** Stops hosting or leaves the joined network. */
  fun release()
}

object NoUpgrade : Upgrade {
  override val canHost = false
  override val canJoin = false
  override fun host(): HostedNetwork? = null
  override fun join(offer: Msg): Conn? = null
  override fun release() {}
}

interface IncomingSink {
  fun write(index: Int, data: ByteArray)
  fun closeFile(index: Int)
  /** Makes the files visible and returns where each was saved. */
  fun finish(): List<String>
  fun discard()
}

interface IncomingStorage {
  fun begin(transferId: String, files: List<Msg.WireFile>): IncomingSink
}

/** One transfer (outgoing or incoming) over one connection. See docs/PROTOCOL.md for the flow. */
class TransferSession(
  val id: String,
  private val local: LocalDevice,
  direction: String,
  peer: Peer?,
  private val upgrade: Upgrade,
  private val onUpdate: (Transfer) -> Unit,
  private val onRequest: (Transfer) -> Unit = {},
  private val trust: Trust = NoTrust,
) {
  private val lock = Object()
  private var state = Transfer(
    id = id, direction = direction, peerId = peer?.id ?: "", peerName = peer?.name ?: "",
    peerPlatform = peer?.platform ?: "android", status = TransferStatus.connecting,
    files = emptyList(), text = null, transport = "wifi", error = null,
  )
  @Volatile private var channel: SecureChannel? = null
  @Volatile private var decision: Boolean? = null
  private var lastEmit = 0L
  private var thread: Thread? = null

  val snapshot: Transfer get() = synchronized(lock) { state }
  private val isFinal get() = snapshot.status.isFinal

  // State

  private fun mutate(force: Boolean = true, change: (Transfer) -> Transfer) {
    val emit: Transfer?
    synchronized(lock) {
      if (state.status.isFinal) return
      state = change(state)
      val now = System.currentTimeMillis()
      emit = if (force || state.status.isFinal || now - lastEmit > 100) {
        lastEmit = now
        state
      } else null
    }
    emit?.let(onUpdate)
  }

  private fun finish(status: TransferStatus, error: String? = null) {
    mutate { it.copy(status = status, error = error) }
    channel?.close()
    upgrade.release()
  }

  fun cancel() {
    if (isFinal) return
    val ch = channel
    synchronized(lock) { if (decision == null) decision = false }
    mutate { it.copy(status = TransferStatus.cancelled) }
    // Best effort: tell the peer, then tear down even if that write is stuck.
    Thread { runCatching { ch?.send(Msg("cancel")) } }.start()
    Thread {
      Thread.sleep(500)
      channel?.close()
      upgrade.release()
    }.start()
  }

  fun respond(accept: Boolean) {
    synchronized(lock) { if (decision == null) decision = accept }
  }

  private fun run(name: String, body: () -> Unit, onError: () -> Unit = {}) {
    thread = Thread({
      try {
        body()
      } catch (e: Throwable) {
        onError()
        if (!isFinal) {
          if (e is CancelledException) finish(TransferStatus.cancelled)
          else finish(TransferStatus.failed, e.message ?: e.javaClass.simpleName)
        }
      }
    }, name).apply { start() }
  }

  // Identity

  /** Our hello, signed for this handshake. `peerId` is who we think we're talking to. */
  private fun hello(ch: SecureChannel, initiator: Boolean, peerId: String?): Msg {
    val identity = trust.identity
    return Msg.hello(local, upgrade.canHost, upgrade.canJoin, upgrade.canAware).copy(
      key = identity?.publicKey,
      sig = identity?.sign(ch.transcript, initiator),
      linked = peerId?.takeIf { it.isNotEmpty() && identity != null }?.let(trust::isLinked),
    )
  }

  /** Verifies the peer's hello and lets the link store react to it. Returns the peer's proven key. */
  private fun verify(hello: Msg, ch: SecureChannel, peerIsInitiator: Boolean): String? {
    val key = Identity.verify(hello, ch.transcript, peerIsInitiator)
    hello.id?.let { trust.observe(it, hello.name ?: "Unknown device", hello.platform ?: "android", key, hello.linked) }
    return key
  }

  private fun linkPeer(key: String) {
    val t = snapshot
    trust.link(LinkedDevice(t.peerId, t.peerName, t.peerPlatform, key))
  }

  // Outgoing

  fun startOutgoing(
    files: List<OutgoingFile>, text: String?, route: String, kind: String = "transfer", connect: () -> Conn,
  ) {
    mutate {
      it.copy(files = files.map { f -> TransferFile(f.name, f.size) }, text = text, transport = route, kind = kind)
    }
    run("crosshare-send", { runOutgoing(files, text, route == "bluetooth", connect) })
  }

  private fun runOutgoing(files: List<OutgoingFile>, text: String?, isBle: Boolean, connect: () -> Conn) {
    val conn = connect()
    val ch = SecureChannel.establish(conn, initiator = true).startReader()
    channel = ch
    if (isFinal) {
      ch.close()
      return
    }

    ch.send(this.hello(ch, initiator = true, peerId = snapshot.peerId))
    val hello = ch.receiveMessage(20_000)
    if (hello.t != "hello") throw ProtocolException("expected hello")
    val peerKey = verify(hello, ch, peerIsInitiator = false)
    mutate {
      it.copy(
        peerId = hello.id ?: it.peerId, peerName = hello.name ?: it.peerName,
        peerPlatform = hello.platform ?: it.peerPlatform,
      )
    }
    val kind = snapshot.kind
    if (kind == "link" && peerKey == null) {
      throw IllegalStateException("${snapshot.peerName} needs to update Crosshare to link")
    }

    val ownNonce = Identity.nonce()
    ch.send(
      Msg(
        "offer", transferId = id, text = text,
        files = files.map { Msg.WireFile(it.name, it.size, it.mime) },
        kind = kind.takeIf { it != "transfer" },
        commit = if (kind == "link") Identity.commitment(ownNonce) else null,
      ),
    )
    mutate { it.copy(status = TransferStatus.waiting) }

    val answer = if (kind == "link" && peerKey != null) {
      confirmLink(ch, ownNonce, peerKey) ?: return
    } else {
      // The receiver has up to two minutes to decide.
      ch.receiveMessage(150_000)
    }
    if (answer.t == "decline") {
      finish(TransferStatus.declined)
      return
    }
    if (answer.t != "accept") throw ProtocolException("expected accept")
    if (kind == "link" && peerKey != null) linkPeer(peerKey)

    var current = ch
    val total = files.sumOf { it.size }
    val canAware = upgrade.canAware && hello.canAware == true
    val weHost = upgrade.canHost && hello.canJoin == true
    val theyHost = hello.canHost == true && upgrade.canJoin
    if (isBle && total > Constants.UPGRADE_THRESHOLD && (canAware || weHost || theyHost)) {
      mutate { it.copy(status = TransferStatus.upgrading) }
      // Wi-Fi Aware first (no system prompt, both phones stay on their Wi-Fi), then a hotspot.
      val aware = if (canAware) hostUpgrade(ch, aware = true) else null
      val upgraded = aware ?: when {
        weHost -> hostUpgrade(ch, aware = false)
        theyHost -> {
          ch.send(Msg("upgradeRequest"))
          val reply = receiveSkippingStale(ch, 30_000)
          if (reply.t == "upgradeOffer") {
            joinUpgrade(reply) ?: run {
              ch.send(Msg("upgradeFailed", token = reply.token))
              null
            }
          } else null
        }
        else -> null
      }
      if (upgraded != null) {
        ch.close()
        current = upgraded
        channel = upgraded
      }
    }

    mutate { it.copy(status = TransferStatus.transferring) }
    val chunkSize = if (isBle && current === ch) Constants.BLE_CHUNK_SIZE else Constants.CHUNK_SIZE
    val buffer = ByteArray(chunkSize)
    files.forEachIndexed { index, file ->
      file.open().use { input ->
        var sent = 0L
        while (sent < file.size) {
          if (isFinal) throw CancelledException()
          checkForCancel(current)
          val want = minOf(chunkSize.toLong(), file.size - sent).toInt()
          val n = input.read(buffer, 0, want)
          if (n <= 0) throw ProtocolException("${file.name} changed while sending")
          current.sendData(buffer, n)
          sent += n
          val done = sent
          mutate(force = false) { t ->
            t.copy(files = t.files.mapIndexed { i, f -> if (i == index) f.copy(transferred = done) else f })
          }
        }
      }
    }
    current.send(Msg("done"))
    // A late "upgradeFailed" from an abandoned upgrade can still be in flight; skip it.
    var final: Msg
    do {
      final = current.receiveMessage(60_000)
    } while (final.t.startsWith("upgrade"))
    if (final.t != "complete") throw ProtocolException("expected complete")
    finish(TransferStatus.completed)
  }

  /**
   * Initiator side of the link code: swap nonces, show the code, and wait for both this user's
   * confirmation and the peer's answer. Returns the peer's answer, or null if this side gave up.
   */
  private fun confirmLink(ch: SecureChannel, ownNonce: ByteArray, peerKey: String): Msg? {
    val reply = ch.receiveMessage(20_000)
    if (reply.t == "decline") return reply
    val peerNonce = reply.nonce?.unhex()
    if (reply.t != "linkNonce" || peerNonce == null || peerNonce.size != 32) {
      throw ProtocolException("expected linkNonce")
    }
    ch.send(Msg("linkReveal", nonce = ownNonce.hex()))
    val code = Identity.code(ch.transcript, trust.identity!!.publicKey, peerKey, ownNonce, peerNonce)
    mutate { it.copy(code = code) }
    onRequest(snapshot)

    // The peer's answer can arrive before or after this user confirms; a decline dismisses the prompt.
    var answer: Msg? = null
    val deadline = System.currentTimeMillis() + 120_000
    while (decision == null) {
      if (System.currentTimeMillis() > deadline) respond(false)
      val frame = ch.poll(200)
      if (frame is Frame.Message) {
        answer = frame.msg
        if (frame.msg.t != "accept") respond(false)
      }
    }
    if (isFinal) return null
    if (decision != true) {
      if (answer?.t == "decline") return answer
      if (answer?.t == "cancel") throw CancelledException()
      runCatching { ch.send(Msg("cancel")) }
      finish(TransferStatus.cancelled)
      return null
    }
    return answer ?: ch.receiveMessage(150_000)
  }

  /** Throws if the receiver sent "cancel" (or the link dropped) while we were streaming. */
  private fun checkForCancel(ch: SecureChannel) {
    val frame = ch.poll(0) ?: return
    if (frame is Frame.Message && frame.msg.t == "cancel") throw CancelledException()
  }

  // Incoming

  fun startIncoming(conn: Conn, route: String, storage: IncomingStorage) {
    mutate { it.copy(transport = route) }
    var sink: IncomingSink? = null
    run(
      "crosshare-receive",
      { runIncoming(conn, route == "bluetooth", storage) { sink = it } },
      onError = { sink?.discard() },
    )
  }

  private fun runIncoming(conn: Conn, isBle: Boolean, storage: IncomingStorage, onSink: (IncomingSink) -> Unit) {
    val ch = SecureChannel.establish(conn, initiator = false).startReader()
    channel = ch
    val hello = ch.receiveMessage(20_000)
    if (hello.t != "hello") throw ProtocolException("expected hello")
    val peerKey = verify(hello, ch, peerIsInitiator = true)
    ch.send(this.hello(ch, initiator = false, peerId = hello.id))

    val offer = ch.receiveMessage(20_000)
    if (offer.t != "offer") throw ProtocolException("expected offer")
    val wireFiles = offer.files ?: emptyList()
    val kind = offer.kind?.takeIf { it == "link" || it == "unlink" } ?: "transfer"
    val peerId = hello.id ?: ""
    // Text from a linked device that proved its identity skips the prompt.
    val trusted = kind == "transfer" && wireFiles.isEmpty() && offer.text != null && trust.isTrusted(peerId, peerKey)
    mutate {
      it.copy(
        peerId = peerId, peerName = hello.name ?: "Unknown device",
        peerPlatform = hello.platform ?: "android",
        files = wireFiles.map { f -> TransferFile(f.name, maxOf(0L, f.size)) },
        text = offer.text, status = TransferStatus.waiting, kind = kind, trusted = trusted,
      )
    }

    // The peer removed the link (the hello already dropped ours), or can't prove who it is.
    if (kind == "unlink" || (kind == "link" && (peerKey == null || offer.commit == null))) {
      runCatching { ch.send(Msg("decline")) }
      finish(TransferStatus.declined)
      return
    }
    if (kind == "link" && peerKey != null) {
      val ownNonce = Identity.nonce()
      ch.send(Msg("linkNonce", nonce = ownNonce.hex()))
      val reveal = ch.receiveMessage(20_000)
      val peerNonce = reveal.nonce?.unhex()
      if (reveal.t != "linkReveal" || peerNonce == null || Identity.commitment(peerNonce) != offer.commit) {
        throw ProtocolException("link nonce doesn't match its commitment")
      }
      val code = Identity.code(ch.transcript, peerKey, trust.identity!!.publicKey, peerNonce, ownNonce)
      mutate { it.copy(code = code) }
    }
    if (trusted) respond(true) else onRequest(snapshot)

    // Wait for the user, watching for the sender giving up.
    var pending: Frame? = null
    val deadline = System.currentTimeMillis() + 120_000
    while (decision == null && pending == null) {
      if (System.currentTimeMillis() > deadline) respond(false)
      pending = ch.poll(200)
    }
    if (pending is Frame.Message && (pending as Frame.Message).msg.t == "cancel") throw CancelledException()
    while (decision == null) Thread.sleep(100)
    if (isFinal) return
    if (decision != true) {
      runCatching { ch.send(Msg("decline")) }
      finish(TransferStatus.declined)
      return
    }
    ch.send(Msg("accept"))
    mutate { it.copy(status = TransferStatus.transferring) }

    val sink = storage.begin(id, wireFiles)
    onSink(sink)
    var current = ch
    fun nextIndex(from: Int): Int {
      var i = from
      while (i < wireFiles.size && wireFiles[i].size <= 0) i++
      return i
    }
    var index = nextIndex(0)
    val written = LongArray(wireFiles.size)

    while (true) {
      val frame = pending ?: current.receive(120_000)
      pending = null
      when (frame) {
        is Frame.Data -> {
          if (index >= wireFiles.size) throw ProtocolException("unexpected data")
          if (written[index] + frame.bytes.size > wireFiles[index].size) {
            throw ProtocolException("more data than announced")
          }
          sink.write(index, frame.bytes)
          written[index] += frame.bytes.size
          val i = index
          val w = written[index]
          mutate(force = false) { t ->
            t.copy(files = t.files.mapIndexed { fi, f -> if (fi == i) f.copy(transferred = w) else f })
          }
          if (written[index] >= wireFiles[index].size) {
            sink.closeFile(index)
            index = nextIndex(index + 1)
          }
        }
        is Frame.Message -> when (frame.msg.t) {
          "upgradeOffer" -> {
            val upgraded = joinUpgrade(frame.msg)
            if (upgraded != null) {
              current.close()
              current = upgraded
              channel = upgraded
            } else {
              current.send(Msg("upgradeFailed", token = frame.msg.token))
            }
            mutate { it.copy(status = TransferStatus.transferring) }
          }
          "upgradeRequest" -> {
            val upgraded = if (upgrade.canHost && hello.canJoin == true) {
              mutate { it.copy(status = TransferStatus.upgrading) }
              hostUpgrade(current, aware = false)
            } else {
              current.send(Msg("upgradeFailed"))
              null
            }
            if (upgraded != null) {
              current.close()
              current = upgraded
              channel = upgraded
            }
            mutate { it.copy(status = TransferStatus.transferring) }
          }
          "done" -> {
            if (index < wireFiles.size) throw ProtocolException("transfer ended early")
            // The initiator only sends "done" once its user confirmed the code too.
            if (kind == "link" && peerKey != null) linkPeer(peerKey)
            val saved = sink.finish()
            mutate { t ->
              t.copy(files = t.files.mapIndexed { i, f -> f.copy(savedUri = saved.getOrNull(i)) })
            }
            current.send(Msg("complete"))
            finish(TransferStatus.completed)
            return
          }
          "cancel" -> throw CancelledException()
          else -> {}
        }
      }
    }
  }

  // Bandwidth upgrade

  /**
   * A joiner's `upgradeFailed` names the offer it gave up on. One for an earlier offer (say, a
   * Wi-Fi Aware attempt we already abandoned) must not cancel the current one.
   */
  private fun isStale(msg: Msg, token: String?) = msg.t == "upgradeFailed" && msg.token != null && msg.token != token

  private fun receiveSkippingStale(ch: SecureChannel, timeoutMs: Long): Msg {
    while (true) {
      val msg = ch.receiveMessage(timeoutMs)
      if (!isStale(msg, null)) return msg
    }
  }

  /** Hosts a hotspot or Wi-Fi Aware link, offers it over the BLE channel and waits for the peer to join. */
  private fun hostUpgrade(ble: SecureChannel, aware: Boolean): SecureChannel? {
    val net = if (aware) upgrade.hostAware() else upgrade.host()
    if (net == null) {
      ble.send(Msg("upgradeFailed", reason = if (aware) "could not start Wi-Fi Aware" else "could not start hotspot"))
      return null
    }
    val token = ByteArray(16).also { SecureRandom().nextBytes(it) }.joinToString("") { "%02x".format(it) }
    ble.send(net.offer.copy(t = "upgradeOffer", port = net.server.localPort, token = token))
    net.server.soTimeout = 500
    // A hotspot joiner may have to accept a system prompt and retry; Wi-Fi Aware has no prompt.
    val deadline = System.currentTimeMillis() + if (aware) 60_000 else 90_000
    var joined = false
    try {
      while (System.currentTimeMillis() < deadline) {
        if (isFinal) throw CancelledException()
        when (val f = ble.poll(0)) {
          is Frame.Message -> when {
            f.msg.t == "upgradeFailed" && !isStale(f.msg, token) -> return null
            f.msg.t == "cancel" -> throw CancelledException()
          }
          else -> {}
        }
        val socket = try {
          net.server.accept()
        } catch (_: SocketTimeoutException) {
          continue
        }
        val candidate = runCatching {
          val ch = SecureChannel.establish(SocketConn(socket), initiator = false).startReader()
          val join = ch.receiveMessage(10_000)
          if (join.t == "upgradeJoin" && join.token == token) {
            ch.send(Msg("upgradeOk"))
            ch
          } else {
            ch.close()
            null
          }
        }.getOrNull()
        if (candidate != null) {
          joined = true
          mutate { it.copy(transport = transportName(net.offer)) }
          return candidate
        }
        runCatching { socket.close() }
      }
      ble.send(Msg("upgradeFailed", reason = "timed out"))
      return null
    } finally {
      runCatching { net.server.close() }
      // Tear down a failed attempt so the next method starts clean.
      if (!joined) upgrade.release()
    }
  }

  /** Joins the peer's hotspot or Wi-Fi Aware link and opens the upgraded channel. */
  private fun joinUpgrade(offer: Msg): SecureChannel? {
    val token = offer.token ?: return null
    val usable = if (offer.method == "aware") upgrade.canAware else upgrade.canJoin
    if (!usable) return null
    mutate { it.copy(status = TransferStatus.upgrading) }
    return runCatching {
      val conn = upgrade.join(offer) ?: return@runCatching null
      val ch = SecureChannel.establish(conn, initiator = true).startReader()
      ch.send(Msg("upgradeJoin", token = token))
      val ok = ch.receiveMessage(15_000)
      if (ok.t != "upgradeOk") {
        ch.close()
        throw ProtocolException("upgrade rejected")
      }
      mutate { it.copy(transport = transportName(offer)) }
      ch
    }.getOrNull() ?: run {
      upgrade.release()
      null
    }
  }

  private fun transportName(offer: Msg) = if (offer.method == "aware") "aware" else "hotspot"
}
