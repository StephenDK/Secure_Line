import express from "express";
import { storeClip, fetchClip } from "../modules/video/clipStore.js";
import { MAX_CLIP_SIZE } from "../utils/limits.js";

const router = express.Router();

router.post(
  "/upload",
  express.raw({ type: "application/octet-stream", limit: MAX_CLIP_SIZE }),
  (req, res) => {
    console.log("UPLOADING");
    const { clipId, roomId } = req.query;

    if (!clipId || !roomId) {
      return res.status(400).send("Missing clipId or roomId");
    }

    console.log("Buffer length:", req.body.length);
    console.log(
      "Buffer preview (hex):",
      req.body.subarray(0, 16).toString("hex"),
    );

    storeClip({
      clipId,
      roomId,
      buffer: req.body,
    });

    res.sendStatus(200);
  },
);

router.get("/:clipId", (req, res) => {
  const { clipId } = req.params;
  const { roomId } = req.query;

  const buffer = fetchClip(clipId, roomId);
  if (!buffer) return res.sendStatus(410);

  res.setHeader("Content-Type", "application/octet-stream");
  res.send(buffer);
});

export default router;
