// icons.js
export function createShareButton() {
  const btn = document.createElement("button");
  btn.id = "shareBtn";
  btn.title = "Share invite link";
  btn.className =
    "text-zinc-400 hover:text-emerald-400 transition text-2xl p-2";

  const icon = document.createElement("iconify-icon");
  icon.setAttribute("icon", "tabler:share");
  icon.width = "24";
  icon.height = "24";

  btn.appendChild(icon);
  return btn;
}

export function createQRButton() {
  const btn = document.createElement("button");
  btn.id = "qrBtn";
  btn.title = "Show QR code";
  btn.className =
    "text-zinc-400 hover:text-emerald-400 transition text-2xl p-2";

  const icon = document.createElement("iconify-icon");
  icon.setAttribute("icon", "tabler:qrcode");
  icon.width = "24";
  icon.height = "24";

  btn.appendChild(icon);
  return btn;
}

export function createImageUploadButton() {
  const label = document.createElement("label");
  label.className = "cursor-pointer";

  const input = document.createElement("input");
  input.type = "file";
  input.id = "imageInput";
  input.accept = "image/*";
  input.capture = "environment";
  input.className = "hidden";

  const icon = document.createElement("iconify-icon");
  icon.setAttribute("icon", "tabler:camera");
  icon.width = "28";
  icon.height = "28";
  icon.className = "p-2 bg-zinc-800 rounded-lg hover:bg-zinc-700 transition";

  label.appendChild(input);
  label.appendChild(icon);
  return label;
}

export function createVideoUploadButton() {
  const label = document.createElement("label");
  label.className = "cursor-pointer";

  const input = document.createElement("input");
  input.type = "file";
  input.id = "videoInput";
  input.accept = "video/*";
  input.capture = "user";
  input.className = "hidden";

  const icon = document.createElement("iconify-icon");
  icon.setAttribute("icon", "tabler:video");
  icon.width = "28";
  icon.height = "28";
  icon.className = "p-2 bg-zinc-800 rounded-lg hover:bg-zinc-700 transition";

  label.appendChild(input);
  label.appendChild(icon);
  return label;
}
