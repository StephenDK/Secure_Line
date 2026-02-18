import express from "express";
import http from "http";
import { WebSocketServer } from "ws";

import clipRoutes from "./routes/clipRoutes.js";
import { acceptClip } from "./modules/video/clipStore.js";

const app = express();
app.use(express.static("public"));
app.use("/clips", clipRoutes);

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;

const rooms = new Map();

wss.on("connection", (ws, req) => {
  const params = new URL(req.url, "http://localhost").searchParams;
  const roomId = params.get("room");

  if (!roomId) {
    ws.send(JSON.stringify({ type: "error", message: "Missing room ID" }));
    ws.close();
    return;
  }

  const room = getOrCreateRoom(roomId);
  const slotIndex = room.clients.findIndex((c) => c === null);

  if (slotIndex === -1) {
    ws.send(JSON.stringify({ type: "error", message: "Room full" }));
    ws.close();
    console.log(`❌ Room ${roomId} full`);
    return;
  }

  ws.roomId = roomId;
  ws.slot = slotIndex;
  room.clients[slotIndex] = ws;

  console.log(`🟢 Client joined room ${roomId} slot ${slotIndex}`);

  const otherIndex = slotIndex === 0 ? 1 : 0;
  if (room.clients[otherIndex] && room.clientKeys[otherIndex]) {
    ws.send(
      JSON.stringify({ type: "pubkey", data: room.clientKeys[otherIndex] }),
    );
  }

  ws.on("message", (data) => {
    let msg;
    try {
      msg = JSON.parse(data);
    } catch {
      console.warn("⚠️ Invalid JSON in room", roomId, ":", data);
      return;
    }

    console.log(
      `📩 Room ${roomId} | Slot ${slotIndex} → ${otherIndex} | ${msg.type}`,
    );

    const other = room.clients[otherIndex];

    if (msg.type === "pubkey") {
      room.clientKeys[slotIndex] = msg.data;
      if (other && other.readyState === 1) {
        other.send(JSON.stringify(msg));
      }
      return;
    }

    // 🎥 clip notification
    if (msg.type === "clip_available") {
      if (other?.readyState === 1) other.send(JSON.stringify(msg));
      return;
    }

    // ✅ clip acceptance
    if (msg.type === "clip_accept") {
      acceptClip(msg.clipId);
      return;
    }

    if (msg.type === "message" || msg.type === "image") {
      if (other && other.readyState === 1) {
        other.send(JSON.stringify(msg));
      }
    }
  });

  ws.on("close", () => {
    console.log(`🔴 Client left room ${roomId} slot ${slotIndex}`);
    room.clients[slotIndex] = null;
    room.clientKeys[slotIndex] = null;

    const other = room.clients[otherIndex];
    if (other && other.readyState === 1) {
      other.send(JSON.stringify({ type: "peer_disconnected" }));
    }

    if (!room.clients[0] && !room.clients[1]) {
      rooms.delete(roomId);
      console.log(`🗑 Room deleted: ${roomId}`);
    }
  });
  ws.on("error", (err) => {
    console.error(`⚠️ WS error in slot ${ws.slot}:`, err.message);
    printRooms();
  });
});

function printRooms() {
  console.log("🗂 Current rooms:");
  if (rooms.size === 0) {
    console.log("  (no active rooms)");
    return;
  }

  for (const [roomId, room] of rooms.entries()) {
    console.log(`  Room ${roomId}:`);
    room.clients.forEach((c, i) => {
      console.log(`    Slot ${i}: ${c ? "CONNECTED" : "EMPTY"}`);
    });
  }
}

function getOrCreateRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      clients: [null, null],
      clientKeys: [null, null],
    });
    console.log(`🆕 Room created: ${roomId}`);
  }
  return rooms.get(roomId);
}

server.listen(PORT, () => {
  console.log(`🚀 Secure line running on http://localhost:${PORT}`);
  printRooms();
});
