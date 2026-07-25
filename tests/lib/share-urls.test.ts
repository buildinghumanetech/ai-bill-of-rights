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

  // Regression: params must REPLACE, not stack. Someone who lands on a shared
  // link, copies the address bar and re-shares would otherwise emit
  // `?ref=A&ref=B`; parseRef reads the first value, so the new sharer's
  // attribution would be silently discarded and the original credited twice.
  it("replaces an existing ref rather than appending a second one", () => {
    const out = withShareParams(`https://example.org/?ref=${OTHER_ID}`, {
      ref: ID,
    });
    expect(out).toBe(`https://example.org/?ref=${ID}`);
    expect(parseRef(new URL(out).searchParams)).toBe(ID);
  });

  it("replaces an existing channel rather than appending", () => {
    const out = withShareParams("https://example.org/?via=x", {
      channel: "copy",
    });
    expect(out).toBe("https://example.org/?via=copy");
    expect(parseChannel(new URL(out).searchParams)).toBe("copy");
  });

  it("re-attributes a fully-attributed url without stacking", () => {
    const shared = `https://example.org/?ref=${OTHER_ID}&via=x`;
    const out = withShareParams(shared, { ref: ID, channel: "linkedin" });
    const sp = new URL(out).searchParams;
    expect(sp.getAll("ref")).toEqual([ID]);
    expect(sp.getAll("via")).toEqual(["linkedin"]);
  });

  it("preserves unrelated query params while replacing attribution", () => {
    const out = withShareParams(
      `https://example.org/?v=1&ref=${OTHER_ID}&keep=yes`,
      { ref: ID },
    );
    const sp = new URL(out).searchParams;
    expect(sp.get("v")).toBe("1");
    expect(sp.get("keep")).toBe("yes");
    expect(sp.getAll("ref")).toEqual([ID]);
  });

  it("removes an existing ref when the caller supplies an invalid one", () => {
    // A caller who says "attribute this to X" with a broken X must not ship a
    // link crediting whoever was there before — that credits someone for a
    // share they didn't make.
    const out = withShareParams(`https://example.org/?ref=${OTHER_ID}`, {
      ref: "not-a-uuid",
      channel: "x",
    });
    const sp = new URL(out).searchParams;
    expect(sp.get("ref")).toBeNull();
    expect(sp.get("via")).toBe("x");
  });

  it("strips attribution when ref is explicitly null", () => {
    const out = withShareParams(`https://example.org/?ref=${OTHER_ID}&v=1`, {
      ref: null,
    });
    const sp = new URL(out).searchParams;
    expect(sp.get("ref")).toBeNull();
    expect(sp.get("v")).toBe("1");
  });

  it("leaves an existing ref untouched when the caller doesn't mention ref", () => {
    // Not passing the key at all is different from passing a bad value: the
    // caller is expressing no opinion, so don't rewrite what's there.
    const out = withShareParams(`https://example.org/?ref=${OTHER_ID}`, {
      channel: "x",
    });
    const sp = new URL(out).searchParams;
    expect(sp.get("ref")).toBe(OTHER_ID);
    expect(sp.get("via")).toBe("x");
  });

  // Regression: only the attribution params may be rewritten. Re-serialising
  // the whole query through URLSearchParams form-encodes params we were never
  // asked to touch.
  it("preserves percent-encoding on unrelated params", () => {
    const out = withShareParams("https://example.org/?title=Hello%20World", {
      ref: ID,
    });
    expect(out).toContain("title=Hello%20World");
    expect(out).not.toContain("Hello+World");
  });

  it("does not escape characters it was not asked to touch", () => {
    const out = withShareParams("https://example.org/?path=a~b", { ref: ID });
    expect(out).toContain("path=a~b");
  });

  it("keeps a mailto body intact", () => {
    // RFC 6068 reads `+` in a mailto as a literal plus, so form-encoding here
    // would deliver "I+just+signed" into the recipient's mail client.
    const mailto =
      "mailto:?subject=Sign%20the%20AI%20Bill%20of%20Rights&body=I%20just%20signed";
    const out = withShareParams(mailto, { ref: ID });
    expect(out).toContain("subject=Sign%20the%20AI%20Bill%20of%20Rights");
    expect(out).toContain("body=I%20just%20signed");
    expect(out).not.toContain("+");
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
