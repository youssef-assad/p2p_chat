import sodium from "https://esm.sh/libsodium-wrappers@0.7.15";

// use the same host the page was loaded from, so it also works from a phone on the LAN
const ws = new WebSocket(`ws://${location.hostname}:8080`);
let pc; // the peer connection
let channel; // the data channel
let keys; // my key pair
let theirKey; // the other tab's public key
const CHUNK = 16 * 1024; // 16 KB per piece
let incoming = null;
let received = 0; // bytes received so far (for the incoming file)

sodium.ready.then(() => {
  keys = sodium.crypto_box_keypair();
});

// ---------- UI helpers ----------
const $ = (id) => document.getElementById(id);

// technical log (inside the collapsible panel)
function log(t) {
  $("log").textContent += t + "\n";
}

// top-right badge: text + color class (badge-off / badge-wait / badge-ok / badge-bad)
function setStatus(text, cls) {
  const el = $("status");
  el.textContent = text;
  el.className = "badge " + cls;
}
// a clickable download link shown as a chat bubble
function addFileLink(name, url) {
  const a = document.createElement("a");
  a.className = "msg peer";
  a.href = url;
  a.download = name; // tells the browser to save instead of open
  a.textContent = `⬇ Download ${name}`;
  const box = $("messages");
  box.appendChild(a);
  box.scrollTop = box.scrollHeight;
}

// chat bubble: kind is "me", "peer" or "system"
function addMessage(kind, text) {
  const div = document.createElement("div");
  div.className = "msg " + kind;
  div.textContent = text; // textContent (not innerHTML) so a peer can't inject HTML
  const box = $("messages");
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

function setComposerEnabled(on) {
  $("text").disabled = !on;
  $("sendBtn").disabled = !on;
  $("text").placeholder = on
    ? "Type a message…"
    : "Waiting for secure connection…";
}

setStatus("Connecting to server…", "badge-wait");
ws.onopen = () => setStatus("Not in a room", "badge-off");
ws.onclose = () =>
  log("signaling server closed (chat keeps working if already connected)");
ws.onerror = () => setStatus("Server unreachable", "badge-bad");

// ---------- WebRTC ----------
function sendSignal(obj) {
  ws.send(JSON.stringify(obj));
}

function createPeer() {
  pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  });
  // iceServers is the list of helpers the browser may contact while gathering candidates.
  // 19302 is the port of Google's free public STUN server.

  // the browser found a possible network path: pass it to the other peer
  pc.onicecandidate = (e) => {
    if (e.candidate) {
      const c = e.candidate;
      log(`candidate: ${c.type} ${c.address}:${c.port}`);
      sendSignal({ type: "candidate", candidate: c });
    }
  };
  // c.type is host, srflx or relay. c.address and c.port tell you where.

  pc.onconnectionstatechange = () => {
    log("state: " + pc.connectionState);
    const s = pc.connectionState;
    if (s === "connecting") setStatus("Connecting…", "badge-wait");
    if (s === "connected") setStatus("Connected", "badge-ok");
    if (s === "disconnected" || s === "failed" || s === "closed") {
      setStatus("Disconnected", "badge-bad");
      setComposerEnabled(false);
      addMessage("system", "Peer disconnected");
    }
  };

  // the OTHER side created the channel; we receive it here
  pc.ondatachannel = (e) => {
    channel = e.channel;
    setupChannel();
  };
}

// ---------- encryption ----------
function showFingerprint() {
  // sort the two keys so both tabs hash them in the same order
  const [a, b] =
    sodium.compare(keys.publicKey, theirKey) < 0
      ? [keys.publicKey, theirKey]
      : [theirKey, keys.publicKey];

  const both = new Uint8Array(64);
  both.set(a, 0);
  both.set(b, 32);

  const hash = sodium.crypto_generichash(8, both);
  const text = sodium.to_hex(hash).match(/.{4}/g).join("-");
  $("fp").textContent = text;
}

function setupChannel() {
  channel.binaryType = "arraybuffer";
  channel.onopen = () => {
    log("channel open, sending my public key");
    channel.send(
      JSON.stringify({ type: "key", key: sodium.to_hex(keys.publicKey) }),
    );
  };

  channel.onmessage = (e) => {
    if (typeof e.data !== "string") {
      if (!incoming) return;
      try {
        const plain = unseal(new Uint8Array(e.data));
        incoming.chunks.push(plain);
        received += plain.length;
      } catch {
        addMessage("system", "⚠ A file chunk failed to decrypt");
      }
      return;
    }
    const msg = JSON.parse(e.data);

    if (msg.type === "key") {
      theirKey = sodium.from_hex(msg.key);
      showFingerprint();
      setComposerEnabled(true);
      addMessage(
        "system",
        "End-to-end encrypted. Compare the security code with your peer.",
      );
      log("key received, chat is now encrypted");
    } else if (msg.type === "file-start") {
      const meta = JSON.parse(sodium.to_string(unseal(sodium.from_hex(msg.h))));
      received = 0;
      incoming = { name: meta.name, size: meta.size, chunks: [] };
      addMessage("system", `Peer is sending ${meta.name} (${meta.size} bytes)`);
    } else if (msg.type === "file-end") {
      if (received !== incoming.size) {
        addMessage(
          "system",
          `⚠ Size mismatch: expected ${incoming.size}, got ${received}`,
        );
      }
      const blob = new Blob(incoming.chunks);
      addFileLink(incoming.name, URL.createObjectURL(blob));
      incoming = null;
    } else if (msg.type === "msg") {
      try {
        const plain = sodium.crypto_box_open_easy(
          sodium.from_hex(msg.c),
          sodium.from_hex(msg.n),
          theirKey,
          keys.privateKey,
        );
        addMessage("peer", sodium.to_string(plain));
      } catch {
        addMessage(
          "system",
          "⚠ A message failed to decrypt (possibly tampered with)",
        );
        log("DECRYPTION FAILED");
      }
    }
  };
}

// ---------- signaling ----------
async function handleSignal(msg) {
  if (msg.type === "peer-joined") {
    // we were here first, so we start the call
    createPeer();
    channel = pc.createDataChannel("chat");
    setupChannel();
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    sendSignal({ type: "offer", sdp: pc.localDescription });
  } else if (msg.type === "offer") {
    createPeer();
    await pc.setRemoteDescription(msg.sdp);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    sendSignal({ type: "answer", sdp: pc.localDescription });
  } else if (msg.type === "answer") {
    await pc.setRemoteDescription(msg.sdp);
  } else if (msg.type === "candidate") {
    await pc.addIceCandidate(msg.candidate);
  } else if (msg.type === "joined") {
    $("joinCard").classList.add("hidden");
    $("chat").classList.remove("hidden");
    if (msg.peers === 1) {
      setStatus("Waiting for peer…", "badge-wait");
      addMessage("system", "Waiting for someone to join this room…");
    }
  } else if (msg.type === "error") {
    setStatus(msg.reason, "badge-bad");
    log("server error: " + msg.reason);
  } else if (msg.type === "peer-left") {
    log("signaling: peer left");
  } else {
    log("server: " + JSON.stringify(msg));
  }
}

// handle messages one at a time, in order
let queue = Promise.resolve();
ws.onmessage = (e) => {
  queue = queue.then(() => handleSignal(JSON.parse(e.data)));
};

// ---------- user actions ----------
$("joinForm").onsubmit = (e) => {
  e.preventDefault();
  const room = $("room").value.trim();
  if (!room) return;
  $("roomLabel").textContent = "Room: " + room;
  sendSignal({ type: "join", room });
};

$("composer").onsubmit = (e) => {
  e.preventDefault();
  if (!theirKey) return;
  const text = $("text").value.trim();
  if (!text) return;

  const nonce = sodium.randombytes_buf(sodium.crypto_box_NONCEBYTES);
  const cipher = sodium.crypto_box_easy(text, nonce, theirKey, keys.privateKey);

  channel.send(
    JSON.stringify({
      type: "msg",
      n: sodium.to_hex(nonce),
      c: sodium.to_hex(cipher),
    }),
  );
  addMessage("me", text);
  log("sent encrypted: " + sodium.to_hex(cipher).slice(0, 24) + "...");
  $("text").value = "";
};

// encrypt bytes -> one frame: [24-byte nonce][ciphertext]
function seal(bytes) {
  const nonce = sodium.randombytes_buf(sodium.crypto_box_NONCEBYTES);
  const cipher = sodium.crypto_box_easy(
    bytes,
    nonce,
    theirKey,
    keys.privateKey,
  );
  const frame = new Uint8Array(nonce.length + cipher.length);
  frame.set(nonce, 0);
  frame.set(cipher, nonce.length);
  return frame;
}

// reverse of seal: split the frame, decrypt (throws if tampered)
function unseal(frame) {
  const n = sodium.crypto_box_NONCEBYTES;
  return sodium.crypto_box_open_easy(
    frame.slice(n),
    frame.slice(0, n),
    theirKey,
    keys.privateKey,
  );
}
async function sendFile(file) {
  const meta = sodium.from_string(
    JSON.stringify({ name: file.name, size: file.size }),
  );
  channel.send(
    JSON.stringify({ type: "file-start", h: sodium.to_hex(seal(meta)) }),
  );

  for (let offset = 0; offset < file.size; offset += CHUNK) {
    // wait while too much data is queued
    while (channel.bufferedAmount > 1_000_000) {
      await new Promise((r) => setTimeout(r, 10));
    }
    const buffer = await file.slice(offset, offset + CHUNK).arrayBuffer();
    channel.send(seal(new Uint8Array(buffer)));
  }

  channel.send(JSON.stringify({ type: "file-end" }));
  log("file fully sent");
}
$("fileInput").onchange = () => {
  const file = $("fileInput").files[0];
  if (!file) return;
  if (!theirKey)
    return addMessage("system", "Wait for the secure connection first");

  addMessage(
    "system",
    `You are sending ${file.name} (${(file.size / 1024).toFixed(1)} KB)`,
  );
  sendFile(file);
  $("fileInput").value = ""; // lets you pick the same file again later
};

// debugging helpers for the browser console (use dbg.theirKey, dbg.keys, dbg.channel)
window.sodium = sodium;
window.dbg = {
  get keys() {
    return keys;
  },
  get theirKey() {
    return theirKey;
  },
  get channel() {
    return channel;
  },
};
