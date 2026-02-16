export function initTextMessaging({
  ws,
  msgInput,
  logMsg,
  encrypt,
  decrypt,
  getSharedKey,
  messageQueue,
}) {
  // ───────── Send text ─────────
  async function sendText() {
    const sharedKey = getSharedKey();
    if (!sharedKey) {
      console.warn("⚠️ Cannot send text: shared key not established");
      return;
    }

    if (!msgInput.value.trim()) return;

    const encrypted = await encrypt(msgInput.value);
    ws.send(JSON.stringify({ type: "message", ...encrypted }));

    logMsg("🟢 " + msgInput.value);
    msgInput.value = "";
  }

  // ───────── Receive text ─────────
  async function handleIncomingText(msg) {
    const sharedKey = getSharedKey();

    if (!sharedKey) {
      messageQueue.push(msg);
      return;
    }

    const text = await decrypt(msg);
    logMsg("❤️ " + text);
  }

  // ───────── Flush queued messages ─────────
  async function flushQueue() {
    const sharedKey = getSharedKey();
    if (!sharedKey) return;

    for (const queued of messageQueue.splice(0)) {
      const text = await decrypt(queued);
      logMsg("❤️ " + text);
    }
  }

  return {
    sendText,
    handleIncomingText,
    flushQueue,
  };
}
