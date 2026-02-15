import express from "express";
import http from "http";
import { WebSocketServer } from "ws";

const app = express();
app.use(express.static("public"));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const clients = new Array(2).fill(null);
const clientKeys = new Array(2).fill(null);

function printSlots() {
  console.log("🗂 Current slots:");
  clients.forEach((c, i) => {
    console.log(`  Slot ${i}: ${c ? "CONNECTED" : "EMPTY"}`);
  });
}

wss.on("connection", (ws) => {
  const slotIndex = clients.findIndex((c) => c === null);
  if (slotIndex === -1) {
    ws.send(JSON.stringify({ type: "error", message: "Max clients reached" }));
    ws.close();
    console.log("❌ Connection rejected — max clients reached");
    printSlots();
    return;
  }

  ws.slot = slotIndex;
  clients[slotIndex] = ws;
  console.log(`🟢 Client connected in slot ${slotIndex}`);
  printSlots();

  // Send existing pubkey from the other client
  const otherIndex = slotIndex === 0 ? 1 : 0;
  if (clients[otherIndex] && clientKeys[otherIndex]) {
    ws.send(JSON.stringify({ type: "pubkey", data: clientKeys[otherIndex] }));
    console.log(
      `➡️ Sent existing pubkey from slot ${otherIndex} to slot ${slotIndex}`,
    );
  }

  ws.on("message", (data) => {
    let msg;
    try {
      msg = JSON.parse(data);
    } catch {
      console.warn("⚠️ Invalid JSON from slot", slotIndex, ":", data);
      return;
    }

    if (msg.type === "pubkey") {
      clientKeys[slotIndex] = msg.data;
      console.log(
        `🔑 Stored pubkey for slot ${slotIndex}: ${msg.data.slice(0, 8)}...`,
      );

      // Forward to the other client
      const other = clients.find((c, i) => c && i !== slotIndex);
      if (other && other.readyState === 1) {
        other.send(JSON.stringify(msg));
        console.log(
          `➡️ Forwarded pubkey from slot ${slotIndex} to slot ${other.slot}`,
        );
      }
      printSlots();
      return;
    }

    if (msg.type === "message") {
      const other = clients.find((c, i) => c && i !== slotIndex);
      if (other && other.readyState === 1) {
        other.send(JSON.stringify(msg));
        console.log(`📩 Message from slot ${slotIndex} → slot ${other.slot}`);
      } else {
        console.log(
          `⚠️ Message from slot ${slotIndex} could not be delivered — no peer`,
        );
      }
      printSlots();
    }
  });

  ws.on("close", () => {
    console.log(`🔴 Client disconnected from slot ${slotIndex}`);
    clients[slotIndex] = null;
    clientKeys[slotIndex] = null;

    // Notify the other client
    const other = clients.find((c, i) => c && i !== slotIndex);
    if (other && other.readyState === 1) {
      other.send(JSON.stringify({ type: "peer_disconnected" }));
      console.log(`ℹ️ Notified slot ${other.slot} that peer disconnected`);
    }
    printSlots();
  });

  ws.on("error", (err) => {
    console.error(`⚠️ WS error in slot ${ws.slot}:`, err.message);
    printSlots();
  });
});

server.listen(3000, () => {
  console.log("🚀 Secure line running on http://localhost:3000");
  printSlots();
});
