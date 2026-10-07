# P2P Encrypted Chat — Build Plan

Companion to `P2P Encrypted Chat — Learning Project.md`. This is the roadmap: what we build, in what order, how we know each step works, and what you learn from it.

## End goal

Two browsers, on different networks, chat and send a file directly to each other. Messages are encrypted end-to-end with our own key exchange. A tiny server only helps them find each other.

## Final architecture

```
Browser A ──────── encrypted DataChannel (WebRTC/DTLS + our layer) ──────── Browser B
    │                                                                          │
    ├── WebSocket ──► Signaling server (Node) ◄── WebSocket ───────────────────┤
    └── STUN / TURN (public STUN, local coturn) ◄────────────────────────────────┘
```

## Final folder layout

```
p2p-chat/
  server/
    package.json
    server.js        signaling server (rooms + relay)
  client/
    index.html       UI: join room, chat box, file picker, fingerprint
    app.js           UI wiring
    signaling.js     WebSocket helper
    peer.js          RTCPeerConnection + DataChannel logic
    crypto.js        libsodium: keys, shared secret, encrypt/decrypt, fingerprint
  coturn/
    turnserver.conf  TURN config (Docker)
  README.md
```

## Phases

Each phase ends with a **checkpoint** you can test. Don't move on until it passes.

### Phase 0 — Setup (30 min)
- Install Node.js (LTS), check `node -v` and `npm -v`.
- Create `p2p-chat/`, run `npm init -y` in `server/`, install `ws`.
- Serve `client/` with a simple static server (e.g. `npx serve client`).
- **Checkpoint:** a "hello" page loads in the browser and `node server.js` prints "listening".
- **Learn:** client vs server, ports, localhost.

### Phase 1 — Signaling server (1h)
- WebSocket server on port 8080.
- Messages: `join(room)`, then relay any message to the *other* peer in the room. Limit rooms to 2 peers.
- Log every message so you can see what signaling looks like.
- **Checkpoint:** open two tabs, join the same room, a test message typed in one shows in the other's console.
- **Learn:** WebSocket, rooms, why signaling is just message passing.

### Phase 2 — Connect two tabs (2h)
- Create `RTCPeerConnection`; first peer creates an **offer**, second replies with an **answer**.
- Exchange **ICE candidates** through the signaling server.
- Open an `RTCDataChannel` and send plain-text chat.
- **Checkpoint:** chat works between two tabs. Closing the server afterwards does *not* break the chat (proof it's P2P).
- **Learn:** offer/answer/SDP, ICE candidates, DataChannel, connection states.

### Phase 3 — STUN and candidates (1h)
- Add `iceServers: [{ urls: "stun:stun.l.google.com:19302" }]`.
- Log every ICE candidate and label it `host`, `srflx` or `relay`.
- Open `chrome://webrtc-internals` and find the selected candidate pair.
- **Checkpoint:** you can read your public IP in a `srflx` candidate. Test with your phone on mobile data against your laptop.
- **Learn:** NAT, STUN, hole punching, candidate types.

### Phase 4 — Own end-to-end encryption (2h)
- Add `libsodium-wrappers`.
- Each peer generates an X25519 key pair on join and sends the public key over the DataChannel.
- Derive a shared key; encrypt every message with authenticated encryption; decrypt on receipt.
- Show a **fingerprint** (short hash of both public keys) in the UI to compare out of band.
- **Checkpoint:** messages are unreadable in Wireshark and in logged raw DataChannel bytes; flipping one byte of a ciphertext makes decryption fail.
- **Learn:** key pairs, key exchange, authenticated encryption, fingerprints, nonces.

### Phase 5 — File transfer (1h)
- Send a file in chunks (about 16 KB) with a header (name, size) and a progress bar.
- Encrypt each chunk. Handle DataChannel back-pressure (`bufferedAmount`).
- **Checkpoint:** a 10 MB file arrives intact; compare hashes of the original and received file.
- **Learn:** chunking, back-pressure, integrity checks.

### Phase 6 — TURN relay (1h)
- Run `coturn` in Docker with a username/password.
- Add it to `iceServers`; set `iceTransportPolicy: "relay"` to force it.
- **Checkpoint:** `webrtc-internals` shows a `relay` candidate pair, the chat still works, and Wireshark shows traffic going to the TURN server and *still* unreadable.
- **Learn:** TURN, relay cost, why E2E matters even through a relay.

### Phase 7 — Attack experiments and wrap-up (1h)
- Make the signaling server swap public keys (man in the middle) and confirm the fingerprints differ.
- Test two different networks (home Wi-Fi vs phone hotspot).
- Write the README: how to run, what you learned, known limits.
- **Checkpoint:** you can explain the whole flow without notes.

## Time budget

| Phase | Time |
|---|---|
| 0 Setup | 0.5h |
| 1 Signaling | 1h |
| 2 Connect tabs | 2h |
| 3 STUN | 1h |
| 4 Encryption | 2h |
| 5 Files | 1h |
| 6 TURN | 1h |
| 7 Attacks + wrap-up | 1h |
| **Total** | **about 9.5h** (1 long day or 2 short ones) |

## Tools needed

- Node.js LTS, a code editor, Chrome (for `webrtc-internals`)
- Docker (for coturn; optional, a public TURN service works)
- Wireshark (for packet inspection)
- A phone with mobile data (for a real second network)

## How we will work

- You write most of the code; I explain each piece first, then review or fix.
- One phase at a time, with its checkpoint tested before moving on.
- Questions at the end of each phase to lock in the concepts.

## Known limits (on purpose)

- No accounts, no database, no persistence.
- Only two peers per room.
- No protection against a compromised signaling server *unless* you compare fingerprints.
- Not for real secrets: it's a learning project, not a audited product.

## Stretch ideas (if time remains)

- Ratcheting keys per message (a taste of Signal's design).
- QR code to share the room and fingerprint.
- Rewrite the signaling server in Rust or Go.
- Group chat with 3+ peers (mesh) and see where it breaks.
