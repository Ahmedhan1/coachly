import { drawImageToCanvas, fillBehind } from './drawImage';
import { fitWithin } from './targetSize';
import { DEFAULT_JPEG_QUALITY, DEFAULT_MAX_IMAGE_SIDE, type DownscaledImage, type ImageDownscaler } from './types';

const KEEPABLE = new Set(['image/jpeg', 'image/png', 'image/webp']);
/** Formats that can carry transparency; checked so a transparent logo never gets a black background. */
const MAY_HAVE_ALPHA = new Set(['image/png', 'image/webp', 'image/gif']);

/**
 * Which blob to store: the original when it already fits, is a storable format and is not bigger than the
 * re-encoded one (re-encoding a small, well-compressed photo can make it larger); otherwise the encoded one.
 */
export function pickStoredBlob(original: Blob, encoded: Blob, originalFits: boolean): Blob {
  if (originalFits && KEEPABLE.has(original.type) && original.size <= encoded.size) return original;
  return encoded;
}

/** True when any sampled pixel is not fully opaque. */
export function hasTransparency(rgba: Uint8ClampedArray, step = 4): boolean {
  for (let i = 3; i < rgba.length; i += 4 * step) if (rgba[i]! < 255) return true;
  return false;
}

/**
 * Browser implementation: decode (createImageBitmap, falling back to <img> when Safari draws nothing, see
 * drawImage.ts), draw onto a canvas at the fitted size, export JPEG (PNG when the picture has transparency,
 * e.g. a logo). Needs a real browser; covered by e2e/manual QA.
 */
export class CanvasImageDownscaler implements ImageDownscaler {
  constructor(private readonly quality = DEFAULT_JPEG_QUALITY) {}

  async downscale(input: Blob, maxSide = DEFAULT_MAX_IMAGE_SIDE): Promise<DownscaledImage> {
    const drawn = await drawImageToCanvas(input, (w, h) => fitWithin(w, h, maxSide));
    const { canvas, context } = drawn;
    try {
      const size = { width: canvas.width, height: canvas.height };
      let alpha = false;
      if (MAY_HAVE_ALPHA.has(input.type)) {
        try {
          alpha = hasTransparency(context.getImageData(0, 0, size.width, size.height).data);
        } catch {
          alpha = true;
        }
      }
      if (!alpha) fillBehind(drawn, '#ffffff');
      const type = alpha ? 'image/png' : 'image/jpeg';
      const encoded = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), type, alpha ? undefined : this.quality),
      );
      const fits = size.width === drawn.sourceWidth && size.height === drawn.sourceHeight;
      // EXIF-rotated originals must be re-encoded so they display upright everywhere.
      const blob = fits && input.type === 'image/jpeg' ? encoded : pickStoredBlob(input, encoded, fits);
      return { blob, ...size };
    } finally {
      canvas.width = 0;
      canvas.height = 0;
    }
  }
}
