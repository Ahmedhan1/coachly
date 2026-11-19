/**
 * Decodes a picture onto a canvas in a way that also works on iPhone Safari.
 *
 * WebKit can hand back an ImageBitmap from `createImageBitmap(blob)` that draws nothing (seen with large camera
 * photos and WebP). Drawn over a white fill, that is a white rectangle where the picture should be. So: decode
 * with createImageBitmap, check that pixels actually landed, and if not decode again through an <img> element
 * (Safari applies EXIF orientation to <img> by itself). Needs a real browser; the pixel check is unit-tested.
 */

export interface DrawnImage {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  /** Size of the decoded picture before scaling. */
  sourceWidth: number;
  sourceHeight: number;
}

interface Decoded {
  source: CanvasImageSource;
  width: number;
  height: number;
  close(): void;
}

/** True when every sampled pixel is fully transparent, i.e. the draw call painted nothing. */
export function isBlank(rgba: Uint8ClampedArray, step = 7): boolean {
  for (let i = 3; i < rgba.length; i += 4 * step) if (rgba[i]! !== 0) return false;
  return true;
}

async function decodeWithBitmap(blob: Blob): Promise<Decoded | null> {
  if (typeof createImageBitmap !== 'function') return null;
  try {
    const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
    if (bitmap.width === 0 || bitmap.height === 0) {
      bitmap.close();
      return null;
    }
    return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
  } catch {
    return null;
  }
}

async function decodeWithElement(blob: Blob): Promise<Decoded> {
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.decoding = 'async';
  try {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('image decode failed'));
      img.src = url;
    });
    // decode() makes Safari finish decoding before drawImage, otherwise the first draw can come out empty.
    await img.decode().catch(() => undefined);
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
  const width = img.naturalWidth;
  const height = img.naturalHeight;
  if (width === 0 || height === 0) {
    URL.revokeObjectURL(url);
    throw new Error('image has no size');
  }
  return { source: img, width, height, close: () => URL.revokeObjectURL(url) };
}

function paint(decoded: Decoded, size: (w: number, h: number) => { width: number; height: number }): DrawnImage {
  const { width, height } = size(decoded.width, decoded.height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, width);
  canvas.height = Math.max(1, height);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('canvas 2d unavailable');
  context.drawImage(decoded.source, 0, 0, canvas.width, canvas.height);
  return { canvas, context, sourceWidth: decoded.width, sourceHeight: decoded.height };
}

function painted(drawn: DrawnImage): boolean {
  try {
    return !isBlank(drawn.context.getImageData(0, 0, drawn.canvas.width, drawn.canvas.height).data);
  } catch {
    return true; // cannot read back: trust the draw
  }
}

function release(drawn: DrawnImage): void {
  drawn.canvas.width = 0;
  drawn.canvas.height = 0;
}

/**
 * Draws `blob` onto a new canvas sized by `size(sourceWidth, sourceHeight)`. Throws when the picture cannot be
 * decoded at all. The caller frees the canvas (width = height = 0) when done; iOS caps total canvas memory.
 */
export async function drawImageToCanvas(blob: Blob, size: (w: number, h: number) => { width: number; height: number }): Promise<DrawnImage> {
  const bitmap = await decodeWithBitmap(blob);
  if (bitmap) {
    try {
      const drawn = paint(bitmap, size);
      if (painted(drawn)) return drawn;
      release(drawn);
    } catch {
      // fall through to <img>
    } finally {
      bitmap.close();
    }
  }
  const element = await decodeWithElement(blob);
  try {
    return paint(element, size);
  } finally {
    element.close();
  }
}

/** Puts `color` behind the picture (JPEG has no transparency; without this, clear pixels turn black). */
export function fillBehind(drawn: DrawnImage, color: string): void {
  const { context, canvas } = drawn;
  context.save();
  context.globalCompositeOperation = 'destination-over';
  context.fillStyle = color;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.restore();
}
