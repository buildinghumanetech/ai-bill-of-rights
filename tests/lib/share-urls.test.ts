import { describe, it, expect } from "vitest";
import {
  withShareParams,
  signerShareUrl,
  homeShareUrl,
  parseRef,
  parseChannel,
  isValidRef,
  isShareChannel,
} from "@/lib/share/urls";

const ID = "eeeb0d40-7bee-4bc9-8808-fecb955a8db0";
const OTHER_ID = "c06cbb39-bcb6-4b3c-bd22-e0154a4c7322";

describe("isValidRef", () => {
  it("accepts a uuid", () => {
    expect(isValidRef(ID)).toBe(true);
  });

  it("rejects junk", () => {
    expect(isValidRef("not-a-uuid")).toBe(false);
    expect(isValidRef("")).toBe(false);
    expect(isValidRef(undefined)).toBe(false);
    expect(isValidRef(null)).toBe(false);
    expect(isValidRef(123)).toBe(false);
  });
});

describe("isShareChannel", () => {
  it("accepts known channels and rejects others", () => {
    expect(isShareChannel("x")).toBe(true);
    expect(isShareChannel("linkedin")).toBe(true);
    expect(isShareChannel("tiktok")).toBe(false);
  });
});

describe("withShareParams", () => {
  it("returns the url untouched when there is nothing to attach", () => {
    expect(withShareParams("https://example.org/")).toBe("https://example.org/");
  });

  it("adds ref and channel with a leading ?", () => {
    expect(withShareParams("https://example.org/", { ref: ID, channel: "x" })).toBe(
      `https://example.org/?ref=${ID}&via=x`,
    );
  });

  it("uses & when the url already has a query string", () => {
    expect(
      withShareParams("https://example.org/?v=1", { ref: ID, channel: "copy" }),
    ).toBe(`https://example.org/?v=1&ref=${ID}&via=copy`);
  });

  it("drops an invalid ref rather than propagating it", () => {
    expect(withShareParams("https://example.org/", { ref: "haxx", channel: "x" })).toBe(
      "https://example.org/?via=x",
    );
  });

  it("keeps the fragment at the end", () => {
    expect(
      withShareParams("https://example.org/page#section", { ref: ID }),
    ).toBe(`https://example.org/page?ref=${ID}#section`);
  });
});

describe("signerShareUrl", () => {
  it("points at the signer page and self-attributes", () => {
    expect(signerShareUrl("https://ai-for-people.org", ID, "linkedin")).toBe(
      `https://ai-for-people.org/signatories/${ID}?ref=${ID}&via=linkedin`,
    );
  });

  it("tolerates a trailing slash on the site url", () => {
    expect(signerShareUrl("https://ai-for-people.org/", ID)).toBe(
      `https://ai-for-people.org/signatories/${ID}?ref=${ID}`,
    );
  });
});

describe("homeShareUrl", () => {
  it("attributes the homepage to the sharer", () => {
    expect(homeShareUrl("https://ai-for-people.org", OTHER_ID, "email")).toBe(
      `https://ai-for-people.org/?ref=${OTHER_ID}&via=email`,
    );
  });

  it("is a plain homepage link with no referrer", () => {
    expect(homeShareUrl("https://ai-for-people.org")).toBe(
      "https://ai-for-people.org/",
    );
  });
});

describe("parseRef / parseChannel", () => {
  it("reads a plain searchParams object", () => {
    expect(parseRef({ ref: ID })).toBe(ID);
    expect(parseChannel({ via: "x" })).toBe("x");
  });

  it("reads URLSearchParams", () => {
    const sp = new URLSearchParams(`ref=${ID}&via=linkedin`);
    expect(parseRef(sp)).toBe(ID);
    expect(parseChannel(sp)).toBe("linkedin");
  });

  it("takes the first value when a param repeats", () => {
    expect(parseRef({ ref: [ID, OTHER_ID] })).toBe(ID);
  });

  it("returns null for missing or invalid values", () => {
    expect(parseRef({})).toBeNull();
    expect(parseRef({ ref: "nope" })).toBeNull();
    expect(parseRef(null)).toBeNull();
    expect(parseChannel({ via: "carrier-pigeon" })).toBeNull();
  });
});
