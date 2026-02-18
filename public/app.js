import { CLIP_TTL_MS } from "../utils/limits.js";
const log = document.getElementById("log");
const status = document.getElementById("status");
const imageInput = document.getElementById("imageInput");
const imageThumbnailContainer = document.getElementById(
  "imageThumbnailContainer",
);
const imageThumbnail = document.getElementById("imageThumbnail");
const msgInput = document.getElementById("msg");
const videoInput = document.getElementById("videoInput");

document.getElementById("sendBtn").addEventListener("click", onSend);

import { generateVideoThumbnail } from "./utils/videoHelpers.js";

let pendingImage = null; // { buffer, mimeType }
let pendingVideo = null; // { buffer, mimeType }

let ws;
let keyPair;
let sharedKey = null;
let theirPublicKey = null;
let localPublicKeySent = false;
let messageQueue = [];

function getRoomId() {
  const params = new URLSearchParams(location.search);
  let room = params.get("room");

  if (!room) {
    room = crypto.randomUUID().slice(0, 8);
    params.set("room", room);
    history.replaceState({}, "", `?${params.toString()}`);
  }

  return room;
}

const roomId = getRoomId();
console.log("🧩 Room ID:", roomId);

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
// ───────── Logging Image helper ─────────
function logImage(buffer, mimeType, isLocal) {
  const blob = new Blob([buffer], { type: mimeType });
  const url = URL.createObjectURL(blob);

  const img = document.createElement("img");
  img.src = url;
  img.className = "max-w-xs rounded-xl border border-zinc-700";

  const wrapper = document.createElement("div");
  wrapper.className = isLocal ? "text-right" : "text-left";
  wrapper.appendChild(img);

  log.appendChild(wrapper);
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
  ws = new WebSocket(`${protocol}://${location.host}?room=${roomId}`);

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

    if (msg.type === "clip_available") {
      showIncomingClipPrompt(msg);
      return;
    }

    if (msg.type === "image") {
      if (!sharedKey) return;

      const iv = new Uint8Array(msg.iv);
      const encrypted = new Uint8Array(msg.data);

      const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        sharedKey,
        encrypted,
      );

      logImage(decrypted, msg.mimeType, false);
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
    console.log("🔴 WebSocket closed");
    status.textContent = "❌ Disconnected. Refresh to reconnect.";
  };

  //   ws.onclose = () => {
  //     console.log("🔄 WebSocket closed, retrying in 3s…");
  //     status.textContent = "🔄 Disconnected. Retrying…";
  //     retryConnect();
  //   };
}

// ───────── Retry logic ─────────
function retryConnect() {
  setTimeout(() => {
    console.log("🔁 Attempting to reconnect…");
    connectWebSocket();
  }, 3000);
}

// ───────── Send message ─────────
async function onSend() {
  if (!sharedKey) {
    console.warn("⚠️ Cannot send: shared key not established");
    return;
  }

  // 1️⃣ If an image is pending, send image FIRST
  if (pendingImage) {
    console.log("📤 Sending pending image");

    try {
      await sendEncryptedImage(pendingImage.buffer, pendingImage.mimeType);
      console.log("✅ Image sent successfully");
    } catch (err) {
      console.error("❌ Failed to send image:", err);
      return;
    }

    // Display image in local chat log
    logImage(pendingImage.buffer, pendingImage.mimeType, true);

    // Clear UI after sending
    pendingImage = null;
    imageThumbnailContainer.classList.add("hidden");
    msgInput.disabled = false;
    msgInput.focus();
    return;
  }

  if (pendingVideo) {
    const clipId = crypto.randomUUID();

    const { iv, encrypted } = await encryptBinary(pendingVideo.buffer);

    await fetch(`/clips/upload?roomId=${roomId}&clipId=${clipId}`, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: encrypted,
    });

    ws.send(
      JSON.stringify({
        type: "clip_available",
        clipId,
        iv: Array.from(iv),
        mimeType: pendingVideo.mimeType,
        expiresIn: CLIP_TTL_MS,
      }),
    );

    logVideo(pendingVideo.buffer, pendingVideo.mimeType, true);

    pendingVideo = null;
    videoThumbnailContainer.classList.add("hidden");
    msgInput.disabled = false;
    msgInput.focus();
    return;
  }

  // 2️⃣ Otherwise, send text message
  if (!msgInput.value.trim()) {
    console.log("ℹ️ Empty message, nothing to send");
    return;
  }

  const encrypted = await encrypt(msgInput.value);
  ws.send(JSON.stringify({ type: "message", ...encrypted }));

  console.log("📤 Sent text message:", msgInput.value);
  logMsg("🟢 " + msgInput.value);
  msgInput.value = "";
}

async function sendEncryptedImage(buffer, mimeType) {
  console.log("🔐 Encrypting image", mimeType, buffer.byteLength, "bytes");

  const iv = crypto.getRandomValues(new Uint8Array(12));

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    sharedKey,
    buffer,
  );

  ws.send(
    JSON.stringify({
      type: "image",
      iv: Array.from(iv),
      mimeType,
      data: Array.from(new Uint8Array(encrypted)),
    }),
  );

  console.log("📡 Encrypted image sent to server");
}

imageInput.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) {
    console.log("🖼️ Image selection canceled");
    return;
  }

  console.log("🖼️ Image selected:", file.name, file.type, file.size, "bytes");

  const buffer = await file.arrayBuffer();

  pendingImage = {
    buffer,
    mimeType: file.type,
  };

  console.log("🕓 Image stored locally, waiting for Send");

  // Show thumbnail preview and disable text input
  const blob = new Blob([buffer], { type: file.type });
  const url = URL.createObjectURL(blob);
  imageThumbnail.src = url;
  imageThumbnailContainer.classList.remove("hidden");
  msgInput.disabled = true;

  imageInput.value = "";
});

// ───────── Video Helpers ─────────
async function encryptBinary(buffer) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    sharedKey,
    buffer,
  );
  return { iv, encrypted };
}

async function decryptBinary(iv, encrypted) {
  return crypto.subtle.decrypt({ name: "AES-GCM", iv }, sharedKey, encrypted);
}

function showIncomingClipPrompt(msg) {
  let remaining = msg.expiresIn;

  const prompt = document.createElement("div");
  prompt.className =
    "bg-yellow-900 text-yellow-200 p-3 rounded-lg flex justify-between items-center";

  const text = document.createElement("span");
  text.textContent = `🎬 Incoming video (${remaining}s)`;

  const btn = document.createElement("button");
  btn.textContent = "Accept";
  btn.className =
    "ml-4 px-3 py-1 rounded bg-emerald-600 text-black font-medium";

  prompt.appendChild(text);
  prompt.appendChild(btn);
  log.appendChild(prompt);

  const interval = setInterval(() => {
    remaining--;
    text.textContent = `🎬 Incoming video (${remaining}s)`;
    if (remaining <= 0) {
      clearInterval(interval);
      prompt.remove();
    }
  }, 1000);

  btn.onclick = async () => {
    clearInterval(interval);
    prompt.remove();

    ws.send(
      JSON.stringify({
        type: "clip_accept",
        clipId: msg.clipId,
      }),
    );

    const res = await fetch(`/clips/${msg.clipId}?roomId=${roomId}`);

    if (!res.ok) {
      alert("❌ Video expired");
      return;
    }

    const encrypted = await res.arrayBuffer();
    const decrypted = await decryptBinary(new Uint8Array(msg.iv), encrypted);

    logVideo(decrypted, msg.mimeType, false);
  };
}

videoInput.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  if (file.size > 10 * 1024 * 1024) {
    alert("❌ Video too large (max 10MB)");
    return;
  }

  const buffer = await file.arrayBuffer();
  pendingVideo = { buffer, mimeType: file.type };

  // Show fake thumbnail container
  const container = document.getElementById("videoThumbnailContainer");
  container.classList.remove("hidden");

  // Clear file input to allow re-selecting same file
  videoInput.value = "";
});

function logVideo(buffer, mimeType, isLocal) {
  const wrapper = document.createElement("div");
  wrapper.className = isLocal
    ? "self-end max-w-[80%]"
    : "self-start max-w-[80%]";

  // Create video element
  const video = document.createElement("video");
  video.controls = true;
  video.className = "w-64 h-36 rounded-lg border border-zinc-700 object-cover";

  // Convert buffer to Blob and set as source
  const blob = new Blob([buffer], { type: mimeType });
  const url = URL.createObjectURL(blob);
  video.src = url;

  wrapper.appendChild(video);
  log.appendChild(wrapper);
  log.scrollTop = log.scrollHeight;
}

document.getElementById("clear_video").onclick = async () => {
  pendingVideo = null;
  const container = document.getElementById("videoThumbnailContainer");
  container.classList.add("hidden");
  msgInput.disabled = false;
  msgInput.focus();
  console.log("🗑️ Pending video cleared");
};

// ───────── Clear pending image ─────────
document.getElementById("clear_image").onclick = async () => {
  pendingImage = null;
  imageThumbnailContainer.classList.add("hidden");
  msgInput.disabled = false;
  msgInput.focus();
  console.log("🗑️ Pending image cleared");
};

// ───────── Share Link Event Handler ─────────
document.getElementById("shareBtn").onclick = async () => {
  const url = location.href;

  try {
    if (navigator.share) {
      await navigator.share({
        title: "Secure Line",
        url,
      });
    } else {
      await navigator.clipboard.writeText(url);
      alert("Invite link copied to clipboard");
    }
  } catch (err) {
    console.error("Share failed:", err);
  }
};
// ───────── QR Link Event Handler ─────────

document.getElementById("qrBtn").onclick = () => {
  const url = location.href;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(
    url,
  )}`;
  window.open(qrUrl, "_blank");
};

// ───────── Initial connect ─────────
connectWebSocket();
