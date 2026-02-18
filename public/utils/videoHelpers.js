// videoHelpers.js

// Generate video thumbnail from a File
export async function generateVideoThumbnail(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.src = url;
    video.crossOrigin = "anonymous";

    video.addEventListener(
      "loadedmetadata",
      () => {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");

        // Draw first frame
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Convert canvas to Data URL
        const thumbnailUrl = canvas.toDataURL("image/png");

        URL.revokeObjectURL(url); // Clean up
        resolve(thumbnailUrl);
      },
      { once: true },
    );

    video.addEventListener("error", (err) => {
      reject(err);
    });
  });
}
