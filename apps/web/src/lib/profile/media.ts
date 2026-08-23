import sharp from "sharp";

import type { ProfileMediaKind } from "./policy";

export type ProcessedProfileMedia = {
  buffer: Buffer;
  width: number;
  height: number;
};

const MAX_INPUT_PIXELS = 40_000_000;

const MEDIA_LIMITS: Record<ProfileMediaKind, { width: number; height: number }> = {
  avatar: { width: 1024, height: 1024 },
  banner: { width: 2400, height: 900 },
};

export async function processProfileMedia(
  kind: ProfileMediaKind,
  input: Buffer,
): Promise<ProcessedProfileMedia> {
  if (!Buffer.isBuffer(input) || input.length === 0) {
    throw new Error("The image could not be decoded safely.");
  }

  const limits = MEDIA_LIMITS[kind];

  try {
    const { data, info } = await sharp(input, {
      failOn: "error",
      limitInputPixels: MAX_INPUT_PIXELS,
    })
      .rotate()
      .resize({
        width: limits.width,
        height: limits.height,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 88, effort: 4 })
      .toBuffer({ resolveWithObject: true });

    if (!info.width || !info.height) {
      throw new Error("missing_output_dimensions");
    }

    return {
      buffer: data,
      width: info.width,
      height: info.height,
    };
  } catch {
    throw new Error("The image could not be decoded safely.");
  }
}
