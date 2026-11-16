import { fitWithin } from './targetSize';
import { DEFAULT_JPEG_QUALITY, DEFAULT_MAX_IMAGE_SIDE, type DownscaledImage, type ImageDownscaler } from './types';

/**
 * Browser implementation: decode with createImageBitmap (respects EXIF orientation),
 * draw onto a canvas at the fitted size, export JPEG. Needs a real browser; covered by e2e/manual QA.
 */
export class CanvasImageDownscaler implements ImageDownscaler {
  constructor(private readonly quality = DEFAULT_JPEG_QUALITY) {}

  async downscale(input: Blob, maxSide = DEFAULT_MAX_IMAGE_SIDE): Promise<DownscaledImage> {
    const bitmap = await createImageBitmap(input, { imageOrientation: 'from-image' });
    try {
      const size = fitWithin(bitmap.width, bitmap.height, maxSide);
      const canvas = document.createElement('canvas');
      canvas.width = size.width;
      canvas.height = size.height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('canvas 2d unavailable');
      context.drawImage(bitmap, 0, 0, size.width, size.height);
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/jpeg', this.quality),
      );
      return { blob, ...size };
    } finally {
      bitmap.close();
    }
  }
}
