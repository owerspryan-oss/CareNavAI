/*
 * In-browser photo preparation for letter capture (FR-08, AC-08.1). The photo is scaled so its
 * longest side is at most MAX_IMAGE_PX and re-encoded as JPEG through a canvas, which drops all
 * metadata (EXIF location, camera, time). The result stays in memory only (AC-08.5, AC-08.6).
 */

/** JPEG quality for the re-encoded photo: small enough to upload quickly, sharp enough to read. */
export const JPEG_QUALITY = 0.85;

/**
 * The size to draw an image at so its longest side is at most `maxPx`, keeping the aspect ratio.
 * Never scales up. Pure, so it is unit-tested directly.
 */
export function fitWithin(width: number, height: number, maxPx: number): { width: number; height: number } {
  if (!(width > 0 && height > 0 && maxPx > 0)) throw new RangeError("Image and limit sizes must be positive");
  const scale = Math.min(1, maxPx / Math.max(width, height));
  return {
    width: Math.max(1, Math.min(maxPx, Math.round(width * scale))),
    height: Math.max(1, Math.min(maxPx, Math.round(height * scale))),
  };
}

/**
 * Resize and re-encode a chosen photo as a metadata-free JPEG. Throws when the browser cannot decode
 * the file (for example an unsupported format); callers show a friendly "try another photo" message.
 */
export async function resizeToJpeg(file: Blob, maxPx: number): Promise<Blob> {
  // "from-image" applies the camera's EXIF rotation before the metadata is dropped.
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height, maxPx);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable");
    // JPEG has no transparency: paint white first so a transparent PNG doesn't turn black.
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Encoding failed"))), "image/jpeg", JPEG_QUALITY),
    );
  } finally {
    bitmap.close();
  }
}
