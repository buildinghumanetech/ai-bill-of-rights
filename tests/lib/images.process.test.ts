import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { processSelfieImage } from "@/lib/images/process";
import { tinyPngBuffer } from "../_fixtures/tiny-png";

describe("processSelfieImage", () => {
  it("returns three buffers with the right dimensions and formats", async () => {
    const out = await processSelfieImage(tinyPngBuffer());
    expect(out.dimensions.width).toBe(16);
    expect(out.dimensions.height).toBe(16);

    const originalMeta = await sharp(out.original).metadata();
    expect(originalMeta.format).toBe("jpeg");

    const displayMeta = await sharp(out.display).metadata();
    expect(displayMeta.format).toBe("webp");
    expect(displayMeta.width).toBe(512);
    expect(displayMeta.height).toBe(512);

    const thumbMeta = await sharp(out.thumbnail).metadata();
    expect(thumbMeta.format).toBe("webp");
    expect(thumbMeta.width).toBe(96);
    expect(thumbMeta.height).toBe(96);
  });

  it("output buffers are non-empty", async () => {
    const out = await processSelfieImage(tinyPngBuffer());
    expect(out.original.byteLength).toBeGreaterThan(0);
    expect(out.display.byteLength).toBeGreaterThan(0);
    expect(out.thumbnail.byteLength).toBeGreaterThan(0);
  });
});
