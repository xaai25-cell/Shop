import "server-only";
import sharp from "sharp";

const MAX_INPUT_BYTES = 4 * 1024 * 1024;
const ALLOWED_FORMATS = new Set(["jpeg", "png", "webp", "avif", "gif", "tiff"]);

export type ProcessedImage = { buffer: Buffer; width: number; height: number; bytes: number };

type Preset = { maxSize: number; quality: number; maxBytes: number };

export const IMAGE_PRESETS = {
  /** Product photos: large enough for zoom, small enough for fast pages. */
  product: { maxSize: 1600, quality: 80, maxBytes: 600 * 1024 },
  /** Category cover photos (wide tiles and banners). */
  category: { maxSize: 1600, quality: 78, maxBytes: 450 * 1024 },
  /** Bank (BML) transfer slips: keep text legible, aggressively small. */
  receipt: { maxSize: 1400, quality: 72, maxBytes: 350 * 1024 },
} satisfies Record<string, Preset>;

/**
 * Validates that the upload is a real image (by decoding it, not trusting the
 * MIME type), strips EXIF/GPS metadata, auto-rotates, resizes and re-encodes
 * to WebP. Quality is lowered step by step until the size budget is met.
 */
export async function processImage(file: File, preset: Preset): Promise<ProcessedImage> {
  if (!(file instanceof File) || file.size === 0) throw new Error("Please choose an image file.");
  if (file.size > MAX_INPUT_BYTES) throw new Error("Image is too large (max 4 MB).");

  const input = Buffer.from(await file.arrayBuffer());

  const meta = await sharp(input, { limitInputPixels: 50_000_000 })
    .metadata()
    .catch(() => null);
  if (!meta) throw new Error("This file is not a valid image.");
  if (!meta.format || !ALLOWED_FORMATS.has(meta.format)) {
    throw new Error("Unsupported image format. Use JPG, PNG or WebP.");
  }

  const encode = (quality: number) =>
    sharp(input, { limitInputPixels: 50_000_000, animated: false })
      .rotate() // honour EXIF orientation; all other metadata (GPS etc.) is dropped
      .resize({ width: preset.maxSize, height: preset.maxSize, fit: "inside", withoutEnlargement: true })
      .webp({ quality, effort: 4, smartSubsample: true })
      .toBuffer({ resolveWithObject: true });

  let quality = preset.quality;
  let out = await encode(quality);
  while (out.data.length > preset.maxBytes && quality > 45) {
    quality -= 10;
    out = await encode(quality);
  }

  return { buffer: out.data, width: out.info.width, height: out.info.height, bytes: out.data.length };
}
