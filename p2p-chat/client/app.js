import sodium from "https://esm.sh/libsodium-wrappers@0.7.15";



const ws = new WebSocket("ws://localhost:8080");
let pc; // the peer connection
let channel; // the data channel
let keys;      // my key pair
let theirKey;  // the other tab's public key

sodium.ready.then(() => {
  keys = sodium.crypto_box_keypair();
});

function log(t) {
  document.getElementById("log").textContent += t + "\n";
}
function sendSignal(obj) {
  ws.send(JSON.stringify(obj));
}

function createPeer() {
  pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  });
  // iceServers is the list of helpers the browser may contact while gathering candidates. 19302 is the port of Google's free public STUN server.

  // the browser found a possible network path: pass it to the other peer
  pc.onicecandidate = (e) => {
    if (e.candidate) {
      const c = e.candidate;
      log(`candidate: ${c.type} ${c.address}:${c.port}`);
      sendSignal({ type: "candidate", candidate: c });
    }
  };
  //   c.type is host, srflx or relay. c.address and c.port tell you where.

  pc.onconnectionstatechange = () => log("state: " + pc.connectionState);

  // the OTHER side created the channel; we receive it here
  pc.ondatachannel = (e) => {
    channel = e.channel;
    setupChannel();
  };
}

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
  document.getElementById("fp").textContent = text;
}
function setupChannel() {
  channel.onopen = () => {
    log("channel open, sending my public key");
    channel.send(JSON.stringify({ type: "key", key: sodium.to_hex(keys.publicKey) }));
  };

  channel.onmessage = (e) => {
    const msg = JSON.parse(e.data);

    if (msg.type === "key") {
      theirKey = sodium.from_hex(msg.key);
      showFingerprint();
      log("key received, chat is now encrypted");
    } else if (msg.type === "msg") {
      try {
        const plain = sodium.crypto_box_open_easy(
          sodium.from_hex(msg.c),
          sodium.from_hex(msg.n),
          theirKey,
          keys.privateKey
        );
        log("peer: " + sodium.to_string(plain));
      } catch {
        log("DECRYPTION FAILED (message was tampered with)");
      }
    }
  };
}

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
  } else {
    log("server: " + JSON.stringify(msg));
  }
}

// handle messages one at a time, in order
let queue = Promise.resolve();
ws.onmessage = (e) => {
  queue = queue.then(() => handleSignal(JSON.parse(e.data)));
};

document.getElementById("joinBtn").onclick = () => {
  sendSignal({ type: "join", room: document.getElementById("room").value });
};

document.getElementById("sendBtn").onclick = () => {
  if (!theirKey) return log("no key yet, wait");
  const text = document.getElementById("text").value;

  const nonce = sodium.randombytes_buf(sodium.crypto_box_NONCEBYTES);
  const cipher = sodium.crypto_box_easy(text, nonce, theirKey, keys.privateKey);

  channel.send(JSON.stringify({ type: "msg", n: sodium.to_hex(nonce), c: sodium.to_hex(cipher) }));
  log("me: " + text + "   [sent as " + sodium.to_hex(cipher).slice(0, 24) + "...]");
};


window.sodium = sodium;
window.dbg = { get keys() { return keys; }, get theirKey() { return theirKey; }, get channel() { return channel; } };
// Then in the console, use dbg.theirKey, dbg.keys.privateKey and dbg.channel instead of the bare names:
const n = sodium.randombytes_buf(24);
const c = sodium.crypto_box_easy("hi", n, dbg.theirKey, dbg.keys.privateKey);
c[0] ^= 1;
dbg.channel.send(JSON.stringify({ type: "msg", n: sodium.to_hex(n), c: sodium.to_hex(c) }));
