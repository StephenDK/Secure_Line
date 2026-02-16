// modules/image.js
export function initImageMessaging(
  ws,
  sharedKey,
  log,
  imageThumbnailContainer,
  imageThumbnail,
) {
  async function sendImage(buffer, mimeType) {
    if (!sharedKey) return;

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

    console.log("📡 Encrypted image sent");
  }

  function receiveImage(msg, isLocal = false) {
    if (!sharedKey) return;

    const iv = new Uint8Array(msg.iv);
    const encrypted = new Uint8Array(msg.data);

    crypto.subtle
      .decrypt({ name: "AES-GCM", iv }, sharedKey, encrypted)
      .then((decrypted) => {
        const blob = new Blob([decrypted], { type: msg.mimeType });
        const url = URL.createObjectURL(blob);
        const img = document.createElement("img");
        img.src = url;
        img.className = "max-w-xs rounded-xl border border-zinc-700";

        const wrapper = document.createElement("div");
        wrapper.className = isLocal ? "text-right" : "text-left";
        wrapper.appendChild(img);
        log.appendChild(wrapper);
        log.scrollTop = log.scrollHeight;
      });
  }

  return { sendImage, receiveImage };
}
