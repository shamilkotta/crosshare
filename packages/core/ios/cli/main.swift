import CrossshareKit
import Foundation

// Test harness for the protocol. Not part of the apps.
//   cs-cli listen [--port N] [--out DIR] [--decline]
//   cs-cli send [--port N --host H | --peer NAME] [--text T] FILE...

final class Printer: CrossshareEngineDelegate {
  var autoAccept = true
  var exitOnFinal = false
  weak var engine: CrossshareEngine?
  var onPeers: (([Peer]) -> Void)?

  func engineDidUpdatePeers(_ peers: [Peer]) {
    print("PEERS " + peers.map { "\($0.name) [\($0.platform.rawValue)] via \($0.routes.joined(separator: ","))" }.joined(separator: "; "))
    onPeers?(peers)
  }

  func engineDidReceiveRequest(_ t: Transfer) {
    print("REQUEST from \(t.peerName): \(t.files.map { "\($0.name) (\($0.size))" }) text=\(t.text ?? "-")")
    engine?.respond(transferId: t.id, accept: autoAccept)
  }

  func engineDidUpdateTransfer(_ t: Transfer) {
    print("TRANSFER \(t.direction.rawValue) \(t.status.rawValue) \(t.transferredBytes)/\(t.totalBytes) via \(t.transport) \(t.error ?? "")")
    if t.status == .completed {
      for f in t.files { if let url = f.savedURL { print("SAVED \(url.path)") } }
    }
    if exitOnFinal && t.status.isFinal {
      exit(t.status == .completed || t.status == .declined ? 0 : 1)
    }
  }
}

var args = Array(CommandLine.arguments.dropFirst())
func option(_ name: String) -> String? {
  guard let i = args.firstIndex(of: name), i + 1 < args.count else { return nil }
  let v = args[i + 1]
  args.removeSubrange(i...(i + 1))
  return v
}
func flag(_ name: String) -> Bool {
  guard let i = args.firstIndex(of: name) else { return false }
  args.remove(at: i)
  return true
}

guard let command = args.first else {
  print("usage: cs-cli listen|send ...")
  exit(2)
}
args.removeFirst()

let port = option("--port").flatMap(UInt16.init)
let out = option("--out") ?? NSTemporaryDirectory() + "crossshare-out"
let name = option("--name") ?? "cli-\(command)"
let printer = Printer()
let engine = CrossshareEngine(
  device: LocalDevice(id: UUID().uuidString, name: name, platform: .macos),
  downloads: URL(fileURLWithPath: out), bluetooth: false)
engine.delegate = printer
printer.engine = engine

switch command {
case "listen":
  printer.autoAccept = !flag("--decline")
  printer.exitOnFinal = flag("--once")
  if let port { engine.debugListen(port: port) } else { engine.setVisible(true) }
  print("LISTENING")
case "send":
  printer.exitOnFinal = true
  let host = option("--host") ?? "127.0.0.1"
  let peerName = option("--peer")
  let text = option("--text")
  let files = try args.map { try OutgoingFile(url: URL(fileURLWithPath: $0)) }
  if let port {
    engine.debugSend(files: files, text: text, host: host, port: port)
  } else {
    var sent = false
    printer.onPeers = { peers in
      guard !sent, let p = peers.first(where: { peerName == nil || $0.name == peerName }) else { return }
      sent = true
      _ = try? engine.send(files: files, text: text, to: p.id)
    }
    engine.setDiscovering(true)
  }
default:
  print("unknown command")
  exit(2)
}
dispatchMain()
