// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { act } from "react";

const submitNewRightAction = vi.fn<(fd: FormData) => Promise<{ ok: boolean; id?: string }>>(
  async () => ({ ok: true, id: "p1" }),
);

vi.mock("@/server/actions/proposals", () => ({
  submitNewRightAction: (fd: FormData) => submitNewRightAction(fd),
}));
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ isSignedIn: true }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { ProposeRightForm } from "@/components/ProposeRightForm";

afterEach(() => {
  cleanup();
  submitNewRightAction.mockClear();
});

describe("ProposeRightForm licence grant", () => {
  it("shows the CC BY 4.0 grant, linked, inside the form before submitting", () => {
    render(<ProposeRightForm />);
    const form = screen.getByRole("button", { name: /file this proposal/i }).closest("form")!;

    const notice = screen.getByText(/by submitting, you agree to license/i);
    expect(form.contains(notice)).toBe(true);
    // Visible, not tucked behind a disclosure.
    expect(notice.closest("details")).toBeNull();

    const link = screen.getByRole("link", { name: "CC BY 4.0" });
    expect(link.getAttribute("href")).toBe("https://creativecommons.org/licenses/by/4.0/");
  });

  it("sends the licence id with the submission so the server can record it", async () => {
    render(<ProposeRightForm />);
    const [title] = screen.getAllByRole("textbox");
    fireEvent.change(title, { target: { value: "Your Mind Is Not a Customer" } });
    const textareas = screen.getAllByRole("textbox").filter((el) => el.tagName === "TEXTAREA");
    fireEvent.change(textareas[0], {
      target: {
        value:
          "No AI system may present uncertain knowledge with false confidence, or substitute fluent answers for the work of understanding.",
      },
    });
    fireEvent.change(textareas[1], {
      target: { value: "Article 4 covers acting against you; this covers deskilling." },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /file this proposal/i }));
    });

    expect(submitNewRightAction).toHaveBeenCalledTimes(1);
    expect(submitNewRightAction.mock.calls[0][0].get("license")).toBe("CC-BY-4.0");
  });
});
