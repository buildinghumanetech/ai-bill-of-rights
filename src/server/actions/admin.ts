"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { consentRecords, signatures, signers } from "@/lib/db/schema";
import { getCurrentAdmin } from "@/lib/admin/check";

let _db: any | null = null;
function getDb() {
  if (!_db) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _db = require("@/lib/db").db;
  }
  return _db;
}

async function requireAdminOrBootstrap() {
  const ctx = await getCurrentAdmin();
  if (ctx.state !== "admin" && ctx.state !== "no-admins-yet") {
    throw new Error("Forbidden: admin only");
  }
  return ctx;
}

export async function bootstrapAdminAction(): Promise<void> {
  const ctx = await getCurrentAdmin();
  if (ctx.state !== "no-admins-yet") {
    throw new Error(
      "Bootstrap not available — an admin already exists or you are not signed in.",
    );
  }
  await getDb()
    .update(signers)
    .set({ isAdmin: true })
    .where(eq(signers.id, ctx.signer.id));
  revalidatePath("/admin/signers");
}

export async function deleteSignerAction(signerId: string): Promise<void> {
  await requireAdminOrBootstrap();
  const db = getDb();
  // Cascade manually since neon-http has no transaction support: delete
  // dependent rows first, then the signer.
  await db.delete(signatures).where(eq(signatures.signerId, signerId));
  await db.delete(consentRecords).where(eq(consentRecords.signerId, signerId));
  await db.delete(signers).where(eq(signers.id, signerId));
  revalidatePath("/admin/signers");
  revalidatePath("/signers");
}

export async function setAdminFlagAction(
  signerId: string,
  makeAdmin: boolean,
): Promise<void> {
  await requireAdminOrBootstrap();
  await getDb()
    .update(signers)
    .set({ isAdmin: makeAdmin })
    .where(eq(signers.id, signerId));
  revalidatePath("/admin/signers");
}
