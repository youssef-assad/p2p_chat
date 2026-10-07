# P2P Encrypted Chat — Learning Project

Goal: learn encryption, signaling, NAT, STUN and TURN by building a small peer-to-peer encrypted chat and file transfer in the browser. One day of work.

## What we build

Two browsers connect directly to each other and exchange chat messages and a file. A tiny server only helps them find each other. On top of the built-in WebRTC encryption, we add our own end-to-end encryption layer.

```
Browser A  <------ encrypted DataChannel ------>  Browser B
    \                                              /
     \--- signaling (WebSocket) --- Server --------/
     \--- STUN / TURN (find path / relay) --------/
```

## Stack and why

| Piece | Choice | Why |
|---|---|---|
| Browser code | Plain JavaScript (or TypeScript) | WebRTC is a browser API; no build step needed to learn. |
| Signaling server | Node.js + `ws` (WebSocket) | Simplest way to pass messages between two peers. |
| Peer connection | WebRTC (`RTCPeerConnection`, `RTCDataChannel`) | Real P2P in the browser, with NAT traversal built in. |
| STUN | Public server (e.g. `stun:stun.l.google.com:19302`) | Tells you your public IP and port. |
| TURN | `coturn` (local or Docker) | Relay when a direct connection is impossible. |
| Own encryption | libsodium (`libsodium-wrappers`) | Vetted library, X25519 key exchange and authenticated encryption. No custom crypto. |
| Debugging | `chrome://webrtc-internals`, Wireshark | See candidates and packets for real. |

## Is JavaScript OK for encryption?

Partly. Using vetted crypto from JS is fine. Implementing crypto in JS is not.

- Pure JS cannot guarantee constant-time operations (timing attacks).
- The garbage collector means secrets can't be reliably wiped from memory.
- The server delivers the JS, so users must trust the server not to ship malicious code.

Rule: never write your own primitives. Use WebCrypto or libsodium (compiled to WASM from C). Rust or C++ matters when you build the primitives yourself, not when you use them.

## Concepts to learn

### Signaling
Two peers can't connect without first exchanging connection info (offer, answer, ICE candidates). WebRTC does not define how; you build it. This is why even "peer to peer" needs a server.

### NAT
Home routers share one public IP among many devices. They only let in traffic that matches an outgoing connection, so peers can't just dial each other's private IP.

### ICE, STUN, TURN
- **ICE** gathers candidate network paths and tests them to find one that works.
- **STUN** tells a peer its public IP and port (server-reflexive candidate). Cheap, no data passes through it.
- **TURN** relays all traffic when direct paths fail (e.g. strict or symmetric NAT). Costs bandwidth, always works.
- Candidate types: `host` (local), `srflx` (via STUN), `relay` (via TURN).

### Encryption layers
- **Transport (built in):** WebRTC encrypts DataChannels with DTLS. It protects against people on the network.
- **End-to-end (ours):** we add our own layer with a key exchange, so even a malicious relay or a compromised signaling server sees only ciphertext.
- **Key exchange:** each peer makes an X25519 key pair and shares the public key. Both derive the same shared secret.
- **Authenticated encryption:** libsodium `crypto_secretbox` or `crypto_box` (XSalsa20-Poly1305). It hides and detects tampering.
- **Limit:** exchanging public keys via the signaling server doesn't stop a malicious server from swapping them (man in the middle). Fix: compare a key fingerprint out of band.

## Plan (about one day)

1. **Signaling server** — Node + `ws`; join a room, relay messages to the other peer. (1h)
2. **Connect two tabs** — offer, answer, ICE candidates, chat over a DataChannel. (2h)
3. **STUN** — add the STUN config; log ICE candidates and read your public IP. (1h)
4. **Own encryption** — X25519 key exchange, encrypt every message with libsodium, show the fingerprint. (2h)
5. **File transfer + TURN** — send a file in chunks; force the relay with coturn and compare. (2h)

## Experiments to run

- Use `iceTransportPolicy: "relay"` to force TURN, and watch the candidate type in `webrtc-internals`.
- Turn off STUN and try connecting from two different networks (phone hotspot).
- Capture traffic in Wireshark: see the DTLS handshake, and check that your payload is unreadable.
- Tamper with a ciphertext byte and confirm decryption fails.
- Swap a public key in the signaling server and see the fingerprint mismatch.

## Out of scope

Accounts, persistence, group chats, mobile, production hardening, writing crypto primitives.

## Project layout

```
p2p-chat/
  server/   signaling server (Node + ws)
  client/   index.html, app.js (WebRTC + libsodium)
  README.md
```
