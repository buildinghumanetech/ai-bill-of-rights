import sharp from "sharp";

export interface ProcessedSelfie {
  original: Buffer;
  display: Buffer;
  thumbnail: Buffer;
  dimensions: { width: number; height: number };
}

const ORIGINAL_MAX = 2048;
const DISPLAY_SIZE = 512;
const THUMBNAIL_SIZE = 96;

/**
 * Resizes a user-supplied selfie into three artifacts:
 *  - original: re-encoded JPEG, max 2048 on the longest side, EXIF stripped.
 *  - display: WebP 512x512 center-cropped.
 *  - thumbnail: WebP 96x96 center-cropped.
 *
 * Auto-rotates per EXIF orientation. Accepts JPEG / PNG / WebP / HEIC inputs
 * via libvips, the engine inside sharp.
 */
export async function processSelfieImage(
  input: Buffer,
): Promise<ProcessedSelfie> {
  // Read metadata once to capture pre-resize dimensions for the policy check.
  const meta = await sharp(input).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;

  const original = await sharp(input)
    .rotate() // auto-orient via EXIF
    .resize({
      width: ORIGINAL_MAX,
      height: ORIGINAL_MAX,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 92, mozjpeg: true })
    .withMetadata({})
    .toBuffer();

  const display = await sharp(input)
    .rotate()
    .resize({
      width: DISPLAY_SIZE,
      height: DISPLAY_SIZE,
      fit: "cover",
      position: "centre",
    })
    .webp({ quality: 85 })
    .withMetadata({})
    .toBuffer();

  const thumbnail = await sharp(input)
    .rotate()
    .resize({
      width: THUMBNAIL_SIZE,
      height: THUMBNAIL_SIZE,
      fit: "cover",
      position: "centre",
    })
    .webp({ quality: 80 })
    .withMetadata({})
    .toBuffer();

  return { original, display, thumbnail, dimensions: { width, height } };
}
