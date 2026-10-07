# WebSockets — Notes

Written while building Phase 1 (signaling server) of the P2P chat project.

## 1. What a WebSocket is

A normal web request works like a letter: the browser asks, the server answers, and the connection closes. A **WebSocket** works like a phone call. Once opened, it stays open, and **either side can send at any time**.

```
Browser ──── "hello" ────► Server
Browser ◄─── "hi!"  ─────  Server   (server speaks without being asked)
```

Why we need it: the signaling server must push messages like "your peer just joined" without the browser asking first.

- `ws://` is the WebSocket version of `http://`.
- `wss://` is the encrypted version (like `https://`). Use it outside localhost.
- A **socket** is one open connection between the server and one browser tab.

## 2. The mental model: a switchboard operator

The server is an operator with 2-person rooms:
- You call in and say "put me in room test" (`join`).
- Anything else you say, the operator repeats to the *other* person in your room, word for word, without understanding it.

## 3. Messages are JSON with a `type`

Raw WebSocket messages are just text or bytes. We use JSON with a `type` field as a label, so the server knows what to do:

```json
{ "type": "join", "room": "test" }
{ "type": "chat", "text": "hi" }
```

- `JSON.stringify(obj)` turns an object into text (before sending).
- `JSON.parse(text)` turns text into an object (after receiving).
- Incoming server data arrives as bytes, so we call `data.toString()` first.

## 4. Server side (Node + `ws`)

```js
const WebSocket = require("ws");
const wss = new WebSocket.Server({ port: 8080 });
```
Starts the server on port 8080. `wss` is the whole server.

```js
wss.on("connection", (socket) => { ... });
```
Runs once per new browser connection. `socket` is the line to that one browser. Three tabs means this function runs three times.

```js
socket.on("message", (data) => { ... });
```
Runs each time that browser sends something.

```js
socket.on("close", () => { ... });
```
Runs when that browser disconnects (tab closed, network lost).

```js
socket.send(text);
```
Sends text to that one browser.

### Server memory

```js
const rooms = new Map();   // "test" -> [socketA, socketB]
```
A `Map` is a lookup table. This is the only state the server keeps.

### The three behaviors

1. **join:** add the socket to a room (max 2), confirm with `joined`, tell the other peer with `peer-joined`. A third peer gets `room full`.
2. **relay:** any other message type is forwarded unchanged to the other peer in the room. Offers, answers and ICE candidates will use this.
3. **close:** remove the socket from its room; if someone remains, send them `peer-left`. If the room is empty, delete it.

## 5. Browser side

```js
const ws = new WebSocket("ws://localhost:8080");   // dial the server
ws.onopen    = () => { ... };                      // connected
ws.onmessage = (e) => { e.data };                  // server sent something
ws.onclose   = () => { ... };                      // connection closed
ws.send(JSON.stringify({ type: "join", room }));   // speak to the server
```

## 6. Full run-through

1. Tab 1 sends `{type:"join", room:"test"}`. Server stores it, replies `joined, peers:1`.
2. Tab 2 joins. Server replies `joined, peers:2` and tells tab 1 `peer-joined`.
3. Tab 1 sends `{type:"chat", text:"hi"}`. Not a `join`, so the server forwards it to tab 2 unchanged.
4. Tab 2 closes. Server tells tab 1 `peer-left`.

## 7. Why the server relays without reading

- The server doesn't need to understand the content, so the code stays tiny.
- If it dropped unknown types, new message kinds (offer, answer, ICE) would silently stop working.
- Later, the content may be encrypted, so the server *couldn't* read it anyway. That is the point of end-to-end encryption.

## 8. Things to watch out for

- `JSON.parse` throws on invalid text. A real server wraps it in `try/catch`; our learning version doesn't.
- `socket.send` on a closed socket throws or fails. Check `socket.readyState === WebSocket.OPEN` before sending in real code.
- Any browser can connect and send anything. A real server validates every message and limits room names and sizes.
- Rooms only exist in memory. Restarting the server loses them.

## 9. Connection to WebRTC

WebRTC can't start by itself: peers must first exchange connection details (offer, answer, ICE candidates). The WebSocket server is the pipe for that exchange. Once the peers are directly connected, the server isn't needed anymore.

## 10. Phase 2: how WebRTC used the WebSocket (and why the server can die)

### The roles
- **WebSocket server:** only a meeting point. It passes setup messages between two tabs.
- **WebRTC connection:** the real direct line between the two browsers, built using those setup messages.

### The handshake, step by step
1. Tab 1 is already in the room. Tab 2 joins, so the server tells tab 1 `peer-joined`.
2. Tab 1 creates an **offer** (SDP): a text blob saying what it supports (data channel, encryption settings, keys for DTLS). It keeps a copy with `setLocalDescription` and sends it through the WebSocket.
3. Tab 2 receives it, stores it with `setRemoteDescription`, creates an **answer**, keeps it with `setLocalDescription`, and sends it back.
4. Tab 1 stores the answer with `setRemoteDescription`. Now both sides know each other's settings.
5. In parallel, each browser discovers **ICE candidates** (possible addresses where it can be reached) and sends each one through the WebSocket. The other side feeds them to `addIceCandidate`.
6. The browsers test the candidate paths by sending packets straight to each other. When one works, the connection state becomes `connected`.
7. The **DataChannel** opens, and chat messages now travel directly between the browsers.

### Why chat keeps working with the server stopped
- The WebSocket was only used for steps 1–5, to *agree on* how to connect.
- After step 6, the browsers have a direct path between them (an IP:port pair on each side). Messages go along it and never touch the server.
- Killing the server only closes the two WebSocket lines. The WebRTC connection is a separate connection and doesn't depend on them.
- Analogy: the server introduced you and a friend and swapped your phone numbers. After that you call each other directly; the matchmaker can go home.
- **Limit:** with the server gone, nobody new can join and a *dropped* connection can't be re-negotiated. You'd need signaling again.

### Code pieces
- `RTCPeerConnection`: the browser object managing the whole connection.
- `createOffer` / `createAnswer`: produce the SDP blobs.
- `setLocalDescription` / `setRemoteDescription`: "this is mine" / "this is theirs". Both sides need both.
- `onicecandidate`: a new path was found, so send it.
- `createDataChannel` (caller) and `ondatachannel` (callee): the chat pipe.
- `queue` of promises: makes async handlers run one at a time so a candidate can't beat the offer.

## 11. chrome://webrtc-internals

A built-in Chrome debugging page. It lists every WebRTC connection open in any tab.

- The two buttons at the top (e.g. `chatgpt.com`, `localhost:3000`) are separate pages that use WebRTC. Click `localhost:3000` to open our connection's details. (ChatGPT uses WebRTC for voice mode.)
- If the page is empty or the connection is missing, open it **before** starting the test, or reload the chat tabs with it open.
- What to look for:
  - **ICE candidate pair / selected pair:** the path actually in use. It shows `local-candidate` and `remote-candidate`, each with a type: `host` (local network address), `srflx` (public address via STUN), `relay` (via TURN).
  - **ICE connection state / connection state:** moves `new → checking → connected`.
  - **Data channel:** its label (`chat`), state, and counters like `messagesSent` / `messagesReceived`.
- Right now you should see only `host` candidates (both tabs are on the same machine, no STUN configured). In Phase 3 `srflx` candidates will appear.

## 12. Quick self-test

1. What is the difference between an HTTP request and a WebSocket?
2. What does `wss.on("connection", ...)` mean, and how often does it run?
3. Why does every message have a `type`?
4. What does the server do with a message of `type: "chat"`?
5. Why is `rooms` the only state the server needs?
