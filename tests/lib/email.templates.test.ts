import { describe, it, expect } from "vitest";
import { signerNotification } from "@/lib/email/templates";

describe("signerNotification template", () => {
  const sample = signerNotification({
    displayName: "Daniel Odio",
    signerPageUrl: "https://ai-for-people.org/signatories/abc-123",
  });

  it("subject names the signer and the document", () => {
    expect(sample.subject).toBe(
      "Daniel Odio just signed the AI Bill of Rights",
    );
  });

  it("body greets, names the signer, and includes the signatory URL", () => {
    expect(sample.text).toContain("Daniel Odio just signed");
    expect(sample.text).toContain(
      "https://ai-for-people.org/signatories/abc-123",
    );
    expect(sample.text).toContain("Your AI for People tech team");
  });
});
