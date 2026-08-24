import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { processProfileMedia } from "./media";

describe("processProfileMedia", () => {
  it("rejects undecodable input instead of storing arbitrary bytes", async () => {
    await expect(processProfileMedia("avatar", Buffer.from("not-an-image"))).rejects.toThrow(
      "The image could not be decoded safely.",
    );
  });

  it("auto-orients avatars, strips metadata, constrains dimensions, and emits WebP", async () => {
    const source = await sharp({
      create: {
        width: 1600,
        height: 1200,
        channels: 3,
        background: { r: 90, g: 30, b: 180 },
      },
    })
      .jpeg({ quality: 95 })
      .withMetadata({ orientation: 6, density: 300 })
      .toBuffer();

    const sourceMetadata = await sharp(source).metadata();
    expect(sourceMetadata.orientation).toBe(6);
    expect(sourceMetadata.exif).toBeDefined();

    const processed = await processProfileMedia("avatar", source);
    const outputMetadata = await sharp(processed.buffer).metadata();

    expect(outputMetadata.format).toBe("webp");
    expect(processed.width).toBeLessThanOrEqual(1024);
    expect(processed.height).toBeLessThanOrEqual(1024);
    expect(outputMetadata.orientation).toBeUndefined();
    expect(outputMetadata.exif).toBeUndefined();
    expect(outputMetadata.icc).toBeUndefined();
  });

  it("constrains banners to 2400 by 900 without enlarging the source", async () => {
    const source = await sharp({
      create: {
        width: 3600,
        height: 1800,
        channels: 3,
        background: { r: 20, g: 120, b: 80 },
      },
    })
      .png()
      .toBuffer();

    const processed = await processProfileMedia("banner", source);
    const outputMetadata = await sharp(processed.buffer).metadata();

    expect(outputMetadata.format).toBe("webp");
    expect(processed.width).toBeLessThanOrEqual(2400);
    expect(processed.height).toBeLessThanOrEqual(900);
    expect(processed.width).toBeGreaterThan(0);
    expect(processed.height).toBeGreaterThan(0);
  });

  it("does not enlarge already-small images", async () => {
    const source = await sharp({
      create: {
        width: 320,
        height: 240,
        channels: 3,
        background: { r: 1, g: 2, b: 3 },
      },
    })
      .webp()
      .toBuffer();

    const processed = await processProfileMedia("avatar", source);

    expect(processed.width).toBe(320);
    expect(processed.height).toBe(240);
  });
});
