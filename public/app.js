const log = document.getElementById("log");
const status = document.getElementById("status");

let ws;
let keyPair;
let sharedKey = null;
let theirPublicKey = null;
let localPublicKeySent = false;
let messageQueue = [];

// ───────── Logging helper ─────────
function logMsg(msg) {
  const div = document.createElement("div");
  div.className = msg.startsWith("🟢")
    ? "self-end max-w-[80%] bg-emerald-600 text-black px-4 py-2 rounded-xl ml-auto"
    : "self-start max-w-[80%] bg-zinc-800 px-4 py-2 rounded-xl";

  div.textContent = msg;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

// ───────── Encryption helpers ─────────
async function generateKeys() {
  keyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    false,
    ["deriveKey"],
  );

  const pub = await crypto.subtle.exportKey("raw", keyPair.publicKey);
  console.log("🔑 Local public key:", new Uint8Array(pub));
  ws.send(
    JSON.stringify({ type: "pubkey", data: Array.from(new Uint8Array(pub)) }),
  );
  console.log("➡️ Sent local pubkey to server");
  localPublicKeySent = true;

  if (theirPublicKey) {
    await deriveSharedKey(theirPublicKey);
  }
}

async function deriveSharedKey(pubBytes) {
  if (sharedKey) return;
  const remoteKey = await crypto.subtle.importKey(
    "raw",
    new Uint8Array(pubBytes),
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );

  sharedKey = await crypto.subtle.deriveKey(
    { name: "ECDH", public: remoteKey },
    keyPair.privateKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );

  console.log("🔐 Shared key established");
  status.textContent = "🔐 Secure connection established";

  // Process queued messages
  for (const queued of messageQueue) {
    const text = await decrypt(queued);
    logMsg("❤️ " + text);
  }
  messageQueue = [];
}

async function encrypt(text) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(text);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    sharedKey,
    data,
  );
  return { iv: Array.from(iv), data: Array.from(new Uint8Array(encrypted)) };
}

async function decrypt(msg) {
  const iv = new Uint8Array(msg.iv);
  const data = new Uint8Array(msg.data);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    sharedKey,
    data,
  );
  return new TextDecoder().decode(decrypted);
}

let stopRetrying = false; // NEW: flag to stop reconnect attempts

// ───────── WebSocket setup with retry ─────────
function connectWebSocket() {
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  ws = new WebSocket(`${protocol}://${location.host}`);

  ws.onopen = async () => {
    console.log("✅ WebSocket connected");
    status.textContent = "Connected. Exchanging keys…";
    try {
      await generateKeys();
    } catch (err) {
      console.error("❌ Key generation error:", err);
    }
  };

  ws.onmessage = async (event) => {
    let data =
      event.data instanceof Blob ? await event.data.text() : event.data;

    let msg;
    try {
      msg = JSON.parse(data);
    } catch (err) {
      console.error("❌ Failed to parse message:", data);
      return;
    }

    if (msg.type === "error") {
      console.warn("⚠️ Server error:", msg.message);
      status.textContent = "❌ " + msg.message;
      ws.close();
      return;
    }

    if (msg.type === "peer_disconnected") {
      console.log("ℹ️ Peer disconnected — clearing shared key");
      sharedKey = null;
      theirPublicKey = null;
      messageQueue = [];
      status.textContent = "🔄 Peer disconnected. Waiting for new key…";
      return;
    }

    if (msg.type === "pubkey") {
      console.log("⬅️ Received remote pubkey:", msg.data);

      // Always replace the old key and derive a new shared key
      theirPublicKey = msg.data;
      try {
        await deriveSharedKey(theirPublicKey);
      } catch (err) {
        console.error("❌ deriveSharedKey failed:", err);
      }
      return;
    }

    if (msg.type === "message") {
      if (!sharedKey) {
        messageQueue.push(msg);
      } else {
        const text = await decrypt(msg);
        logMsg("❤️ " + text);
      }
    }
  };

  ws.onerror = (err) => {
    console.error("⚠️ WebSocket error:", err);
  };

  ws.onclose = () => {
    console.log("🔄 WebSocket closed, retrying in 3s…");
    status.textContent = "🔄 Disconnected. Retrying…";
    retryConnect();
  };
}

// ───────── Retry logic ─────────
function retryConnect() {
  setTimeout(() => {
    console.log("🔁 Attempting to reconnect…");
    connectWebSocket();
  }, 3000);
}

// ───────── Send message ─────────
async function send() {
  if (!sharedKey) {
    console.warn("⚠️ Cannot send message: key not established");
    return;
  }
  const input = document.getElementById("msg");
  const encrypted = await encrypt(input.value);
  ws.send(JSON.stringify({ type: "message", ...encrypted }));
  logMsg("🟢 " + input.value);
  input.value = "";
}

// ───────── Initial connect ─────────
connectWebSocket();
