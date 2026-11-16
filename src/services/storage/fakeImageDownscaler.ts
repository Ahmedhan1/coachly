import { fitWithin } from './targetSize';
import { DEFAULT_MAX_IMAGE_SIDE, type DownscaledImage, type ImageDownscaler } from './types';

/** Test fake: pretends the input has the given size and returns it re-typed as JPEG. */
export class FakeImageDownscaler implements ImageDownscaler {
  constructor(private readonly sourceSize = { width: 4032, height: 3024 }) {}

  async downscale(input: Blob, maxSide = DEFAULT_MAX_IMAGE_SIDE): Promise<DownscaledImage> {
    const size = fitWithin(this.sourceSize.width, this.sourceSize.height, maxSide);
    return { blob: new Blob([await input.arrayBuffer()], { type: 'image/jpeg' }), ...size };
  }
}
