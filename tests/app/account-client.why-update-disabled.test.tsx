// @vitest-environment jsdom
/**
 * The Update button in the account page's "why you signed" editor.
 *
 * Setting a statement costs one of ten edits an hour; only taking it down is
 * free. So a button that stays live on unchanged text is a way to spend the
 * whole budget without typing anything: ten idle clicks of "Update" write the
 * text that is already stored ten times over, and then the signer cannot
 * actually change it for the rest of the hour.
 *
 * This mounts the real component and drives the textarea, because "disabled
 * until you edit, live once you do" is a claim about two states and a test that
 * only ever saw the first would pass just as well against `disabled={true}`.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("@clerk/nextjs", () => ({ useClerk: () => ({ signOut: vi.fn() }) }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
// "use server" modules: they build a Neon client and reach for Clerk at call
// time, and nothing here calls them.
vi.mock("@/server/actions/account", () => ({
  removeMySignatureForVersionAction: vi.fn(),
  updateMyProfileAction: vi.fn(),
}));
vi.mock("@/server/actions/why-i-signed", () => ({ saveWhyISigned: vi.fn() }));
vi.mock("@/server/actions/selfie", () => ({ removeMySelfieAction: vi.fn() }));

import AccountClient from "@/app/account/AccountClient";

interface Editor {
  /** The submit button of the "why you signed" form. */
  button(): HTMLButtonElement;
  /** Type into the textarea the way a person would, through React's onChange. */
  type(text: string): void;
  unmount(): void;
}

function mountEditor(initialWhyISigned: string | null): Editor {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: Root;
  act(() => {
    root = createRoot(container);
    root.render(
      <AccountClient
        initialDisplayName="Alexandra Petrova-Whitfield"
        initialAffiliation={null}
        initialLocationText={null}
        initialWhyISigned={initialWhyISigned}
        verificationMethod="email"
        signatures={[]}
        selfieCard={{ status: "none" }}
      />,
    );
  });

  const textarea = container.querySelector<HTMLTextAreaElement>(
    "#account-why-i-signed",
  );
  if (!textarea) throw new Error("no why-I-signed textarea");
  const form = textarea.closest("form");
  if (!form) throw new Error("textarea is not in a form");

  return {
    button() {
      const btn = form.querySelector<HTMLButtonElement>(
        'button[type="submit"]',
      );
      if (!btn) throw new Error("no submit button in the why-I-signed form");
      return btn;
    },
    type(text: string) {
      // React installs its own value setter on the element, so assigning
      // `.value` directly is invisible to it; go through the prototype's
      // setter and then fire the event React is actually listening for.
      const setValue = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )!.set!;
      act(() => {
        setValue.call(textarea, text);
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
      });
    },
    unmount() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe("AccountClient — the Update button", () => {
  beforeEach(() => {
    // React gates `act` on this global; without it every act() call warns that
    // the test is not configured to support it.
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
  });

  it("is disabled on unchanged text and live as soon as the text differs", () => {
    const editor = mountEditor("The statement I wrote when I signed.");
    try {
      // Freshly loaded: the textarea holds exactly what is stored, so there is
      // nothing to save and the button must not be able to spend an edit.
      expect(editor.button().textContent).toBe("Update");
      expect(editor.button().disabled).toBe(true);

      // One character of real editing and it is a genuine save again.
      editor.type("The statement I wrote when I signed, revised.");
      expect(editor.button().disabled).toBe(false);

      // Typed back to what is stored — nothing to save once more.
      editor.type("The statement I wrote when I signed.");
      expect(editor.button().disabled).toBe(true);
    } finally {
      editor.unmount();
    }
  });

  it("is disabled while the textarea is empty, live once something is written", () => {
    const editor = mountEditor(null);
    try {
      expect(editor.button().textContent).toBe("Save");
      expect(editor.button().disabled).toBe(true);

      // Whitespace is not a statement; the server would normalise it to NULL.
      editor.type("   \n  ");
      expect(editor.button().disabled).toBe(true);

      editor.type("Because my kids deserve better.");
      expect(editor.button().disabled).toBe(false);
    } finally {
      editor.unmount();
    }
  });

  it("still offers Remove when there is something to take down", () => {
    // A disabled Update button must not read as "this form is dead": the free,
    // never-refused path off a statement you regret sits right beside it, and
    // it only renders when there is in fact a statement to remove.
    const withStatement = mountEditor("The statement I wrote when I signed.");
    try {
      const remove = withStatement
        .button()
        .parentElement!.querySelector('button[type="button"]');
      expect(remove?.textContent).toBe("Remove");
    } finally {
      withStatement.unmount();
    }

    const without = mountEditor(null);
    try {
      expect(
        without.button().parentElement!.querySelector('button[type="button"]'),
      ).toBeNull();
    } finally {
      without.unmount();
    }
  });
});
