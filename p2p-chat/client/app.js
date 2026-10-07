const ws = new WebSocket("ws://localhost:8080");
let pc; // the peer connection
let channel; // the data channel

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

function setupChannel() {
  channel.onopen = () => log("channel open, you can chat");
  channel.onmessage = (e) => log("peer: " + e.data);
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
  const text = document.getElementById("text").value;
  channel.send(text);
  log("me: " + text);
};
