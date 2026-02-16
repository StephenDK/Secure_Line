// modules/video.js
export function initVideoMessaging(ws, sharedKey, log) {
  const CHUNK_SIZE = 1024 * 1024; // 1 MB per chunk

  async function sendVideo(buffer, mimeType) {
    if (!sharedKey) return;

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      sharedKey,
      buffer,
    );

    for (let i = 0; i < encrypted.byteLength; i += CHUNK_SIZE) {
      const chunk = encrypted.slice(i, i + CHUNK_SIZE);
      ws.send(
        JSON.stringify({
          type: "video_chunk",
          index: i,
          data: Array.from(new Uint8Array(chunk)),
          iv: Array.from(iv),
          mimeType,
        }),
      );
    }

    console.log("🎬 Video sent in chunks");
  }

  let videoChunks = [];
  function receiveVideo(msg) {
    const iv = new Uint8Array(msg.iv);
    const chunk = new Uint8Array(msg.data);
    videoChunks[msg.index] = chunk;

    // check if all chunks are present
    if (videoChunks.every(Boolean)) {
      const totalLength = videoChunks.reduce((sum, c) => sum + c.length, 0);
      const combined = new Uint8Array(totalLength);
      let offset = 0;
      videoChunks.forEach((c) => {
        combined.set(c, offset);
        offset += c.length;
      });

      crypto.subtle
        .decrypt({ name: "AES-GCM", iv }, sharedKey, combined)
        .then((decrypted) => {
          const blob = new Blob([decrypted], { type: msg.mimeType });
          const url = URL.createObjectURL(blob);
          const videoEl = document.createElement("video");
          videoEl.src = url;
          videoEl.controls = true;
          videoEl.className = "max-w-md rounded-xl border border-zinc-700";
          log.appendChild(videoEl);
          log.scrollTop = log.scrollHeight;
        });

      videoChunks = [];
    }
  }

  return { sendVideo, receiveVideo };
}
