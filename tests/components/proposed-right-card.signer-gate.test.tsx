// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { act } from "react";

const toggleProposalUpvoteAction = vi.fn(async (_id: string) => ({
  ok: false,
  code: "not_signer",
  error: "Only people who have signed the AI Bill of Rights can file or endorse proposals.",
}));

vi.mock("@/server/actions/proposals", () => ({
  toggleProposalUpvoteAction: (id: string) => toggleProposalUpvoteAction(id),
  withdrawProposalAction: vi.fn(),
}));
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { ProposedRightCard } from "@/components/ProposedRightCard";
import type { ProposedRight } from "@/lib/db/proposal-queries";

const proposal: ProposedRight = {
  id: "p1",
  title: "Your Mind Is Not a Customer",
  body: "No AI system may present uncertain knowledge with false confidence.",
  rationale: null,
  pullQuote: null,
  status: "pending",
  createdAt: new Date("2026-09-24T00:00:00Z"),
  proposerSignerId: "s-other",
  proposerDisplayName: "Someone",
  proposerAffiliation: null,
  upvoteCount: 1,
  commentCount: 0,
  viewerHasUpvoted: false,
  hiddenAt: null,
  hiddenReason: null,
  license: "CC-BY-4.0",
  licenseGrantedAt: null,
};

afterEach(() => cleanup());

describe("ProposedRightCard endorse refusal", () => {
  it("offers signing when the server says the account hasn't signed", async () => {
    const opened: unknown[] = [];
    const onOpen = (e: Event) => opened.push((e as CustomEvent).detail);
    window.addEventListener("open-sign-modal", onOpen);

    render(<ProposedRightCard proposal={proposal} viewerSignerId="s-me" />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /endorse this proposed right/i }));
    });

    expect(screen.getByText(/only people who have signed/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /sign the ai bill of rights/i }));
    expect(opened).toEqual([{ mode: "sign" }]);
    window.removeEventListener("open-sign-modal", onOpen);
  });
});
