/**
 * Where a version email goes. No address lives in our database for real
 * accounts: it comes from Clerk (primary email, else any email). Signers an
 * admin added by hand have no Clerk account, so theirs is the contact_value
 * on their consent record, used only when the admin recorded an email.
 * Phone-only signers have no address and are reported as "no email".
 */

import { desc, eq } from "drizzle-orm";
import { consentRecords } from "@/lib/db/schema";
import type { Candidate, Contact } from "./campaign";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- same untyped drizzle client as @/lib/db/queries
type Db = any;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** First word of a display name, unless it is masked ("E****"). */
function firstNameFromDisplay(displayName: string): string | null {
  const first = displayName.trim().split(/\s+/)[0] ?? "";
  return first && !first.includes("*") ? first : null;
}

export async function lookupContacts(
  db: Db,
  candidates: Candidate[],
): Promise<Map<string, Contact>> {
  const out = new Map<string, Contact>();
  const adminAdded = candidates.filter((c) => c.clerkUserId.startsWith("admin-added-"));
  const real = candidates.filter((c) => !c.clerkUserId.startsWith("admin-added-"));

  if (real.length > 0) {
    const { clerkClient } = await import("@clerk/nextjs/server");
    const clerk = await clerkClient();
    for (let i = 0; i < real.length; i += 100) {
      const chunk = real.slice(i, i + 100);
      const { data: users } = await clerk.users.getUserList({
        userId: chunk.map((c) => c.clerkUserId),
        limit: 100,
      });
      const byId = new Map(users.map((u) => [u.id, u]));
      for (const c of chunk) {
        const u = byId.get(c.clerkUserId);
        const email =
          u?.primaryEmailAddress?.emailAddress ?? u?.emailAddresses?.[0]?.emailAddress;
        if (email) out.set(c.signerId, { email, firstName: u?.firstName ?? null });
      }
    }
  }

  for (const c of adminAdded) {
    const rows: Array<{ capturedFields: unknown }> = await db
      .select({ capturedFields: consentRecords.capturedFields })
      .from(consentRecords)
      .where(eq(consentRecords.signerId, c.signerId))
      .orderBy(desc(consentRecords.consentedAt))
      .limit(1);
    const fields = (rows[0]?.capturedFields ?? {}) as {
      contact_method?: string;
      contact_value?: string | null;
    };
    const value = fields.contact_value?.trim() ?? "";
    if (fields.contact_method === "email" && EMAIL_RE.test(value)) {
      out.set(c.signerId, { email: value, firstName: firstNameFromDisplay(c.displayName) });
    }
  }
  return out;
}
