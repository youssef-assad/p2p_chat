const WebSocket = require("ws");
const wss = new WebSocket.Server({ port: 8080 });
// room name -> array of sockets (max 2)
const rooms = new Map();

wss.on("connection", (socket) => {
  console.log("a client connected");
  socket.room = null;

  socket.on("message", (data) => {
    const msg = JSON.parse(data.toString());
    console.log("received:", msg);
    if (msg.type === "join") {
      const peers = rooms.get(msg.room) || [];

      if (peers.length >= 2) {
        socket.send(JSON.stringify({ type: "error", reason: "room full" }));
        return;
      }
      peers.push(socket);
      rooms.set(msg.room, peers);
      socket.room = msg.room;
      socket.send(JSON.stringify({ type: "joined", peers: peers.length }));

      // tell the other peer someone arrived
      peers.forEach((p) => {
        if (p !== socket) p.send(JSON.stringify({ type: "peer-joined" }));
      });
      return;
    }
    // any other message: relay it to the other peer in the room
    const peers = rooms.get(socket.room) || [];
    peers.forEach((p) => {
      if (p !== socket) p.send(JSON.stringify(msg));
    });
  });

  socket.on("close", () => {
    console.log("a client left");
    const peers = (rooms.get(socket.room) || []).filter((p) => p !== socket);
    if (peers.length === 0) rooms.delete(socket.room);
    else {
      rooms.set(socket.room, peers);
      peers.forEach((p) => p.send(JSON.stringify({ type: "peer-left" })));
    }
  });
});

console.log("signaling server listening on ws://localhost:8080");
