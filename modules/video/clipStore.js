import { CLIP_TTL_MS } from "../../utils/limits.js";

const clips = new Map();

export function storeClip({ clipId, roomId, buffer }) {
  const expiresAt = Date.now() + CLIP_TTL_MS;

  const timer = setTimeout(() => {
    clips.delete(clipId);
    console.info("[clip:expire]", {
      clipId,
      roomId,
      reason: "ttl_elapsed",
    });
  }, CLIP_TTL_MS);

  clips.set(clipId, {
    buffer,
    roomId,
    expiresAt,
    accepted: false,
    fetched: false,
    timer,
  });

  console.info("[clip:store]", {
    clipId,
    roomId,
    ttlMs: CLIP_TTL_MS,
    size: buffer?.length ?? "unknown",
  });
}

export function acceptClip(clipId) {
  const clip = clips.get(clipId);

  if (!clip) {
    console.warn("[clip:accept:fail]", {
      clipId,
      reason: "not_found",
    });
    return false;
  }

  clip.accepted = true;

  console.info("[clip:accept]", {
    clipId,
    roomId: clip.roomId,
  });

  return true;
}

export function fetchClip(clipId, roomId) {
  const clip = clips.get(clipId);

  if (!clip) {
    console.warn("[clip:fetch:fail]", {
      clipId,
      roomId,
      reason: "not_found",
    });
    return null;
  }

  if (clip.roomId !== roomId) {
    console.warn("[clip:fetch:fail]", {
      clipId,
      roomId,
      reason: "room_mismatch",
    });
    return null;
  }

  if (!clip.accepted) {
    console.warn("[clip:fetch:fail]", {
      clipId,
      roomId,
      reason: "not_accepted",
    });
    return null;
  }

  if (clip.fetched) {
    console.warn("[clip:fetch:fail]", {
      clipId,
      roomId,
      reason: "already_fetched",
    });
    return null;
  }

  if (Date.now() > clip.expiresAt) {
    console.warn("[clip:fetch:fail]", {
      clipId,
      roomId,
      reason: "expired",
    });
    return null;
  }

  clip.fetched = true;
  clearTimeout(clip.timer);
  clips.delete(clipId);

  console.info("[clip:fetch]", {
    clipId,
    roomId,
    size: clip.buffer?.length ?? "unknown",
  });

  return clip.buffer;
}
