import { describe, expect, it } from "vitest";
import {
  validateSelfieInput,
  validateImageDimensions,
  rejectionReasonToText,
  MAX_INPUT_BYTES,
  ALLOWED_MIMES,
  SELFIE_AUTO_HIDE_THRESHOLD,
  SELFIE_RATE_LIMIT_PER_HOUR,
  REJECTION_REASONS,
} from "@/lib/selfie/policy";

describe("validateSelfieInput", () => {
  it("accepts each allowed mime at a small declared size", () => {
    for (const m of ALLOWED_MIMES) {
      const r = validateSelfieInput({ mime: m, declaredSize: 1024 });
      expect(r.ok).toBe(true);
    }
  });

  it("treats mime case-insensitively", () => {
    expect(
      validateSelfieInput({ mime: "IMAGE/JPEG", declaredSize: 1024 }).ok,
    ).toBe(true);
  });

  it("rejects disallowed mime", () => {
    const r = validateSelfieInput({
      mime: "application/pdf",
      declaredSize: 1024,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("disallowed_mime");
  });

  it("rejects oversized input", () => {
    const r = validateSelfieInput({
      mime: "image/jpeg",
      declaredSize: MAX_INPUT_BYTES + 1,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("too_large");
  });

  it("rejects empty input (size <= 0)", () => {
    for (const size of [0, -1]) {
      const r = validateSelfieInput({ mime: "image/jpeg", declaredSize: size });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe("empty");
    }
  });
});

describe("validateImageDimensions", () => {
  it("accepts normal dimensions", () => {
    expect(validateImageDimensions(1920, 1080).ok).toBe(true);
  });
  it("rejects dimensions over the cap", () => {
    const r = validateImageDimensions(9000, 1000);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("too_pixels");
  });
});

describe("policy constants", () => {
  it("exports the auto-hide threshold and rate limit", () => {
    expect(SELFIE_AUTO_HIDE_THRESHOLD).toBe(3);
    expect(SELFIE_RATE_LIMIT_PER_HOUR).toBe(5);
  });
  it("has all five rejection reasons mapped to text", () => {
    for (const r of REJECTION_REASONS) {
      expect(rejectionReasonToText(r)).toMatch(/\S/);
    }
  });
});
