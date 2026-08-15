/**
 * Browser-only canvas helpers. Full-res phone photos blow the request limit
 * and kill the demo, so everything gets downscaled before it ever leaves the
 * device.
 */

export const DOWNSCALE_MAX_EDGE = 1280;
const JPEG_QUALITY = 0.82;

/** Draws any canvas-drawable source into a bounded JPEG data URL. */
export function drawToJpeg(
  source: CanvasImageSource,
  width: number,
  height: number,
  maxEdge: number = DOWNSCALE_MAX_EDGE,
): string {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not supported in this browser.');
  ctx.drawImage(source, 0, 0, w, h);

  return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
}

/**
 * Loading through an <img> element (rather than createImageBitmap) so EXIF
 * orientation is applied the same way the browser already displays it.
 */
export async function downscaleImageFile(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not read that image.'));
      el.src = url;
    });
    return drawToJpeg(img, img.naturalWidth, img.naturalHeight);
  } finally {
    URL.revokeObjectURL(url);
  }
}
