import { describe, expect, it } from "vitest";
import { createTestDb } from "../_helpers/pglite-db";
import { selfies, selfieReports, signers } from "@/lib/db/schema";

async function makeSigner(db: any, clerkId: string) {
  const [row] = await db
    .insert(signers)
    .values({
      clerkUserId: clerkId,
      displayName: clerkId,
      verificationMethod: "email",
      verifiedAt: new Date(),
    })
    .returning({ id: signers.id });
  return row.id as string;
}

describe("selfies schema", () => {
  it("inserts a pending selfie row", async () => {
    const db = await createTestDb();
    const signerId = await makeSigner(db, "u1");
    const [row] = await db
      .insert(selfies)
      .values({
        signerId,
        status: "pending",
        displayBlobUrl: "y",
        thumbnailBlobUrl: "z",
        captureMethod: "live",
      })
      .returning();
    expect(row.status).toBe("pending");
    expect(row.signerId).toBe(signerId);
  });

  it("enforces at-most-one-active-approved per signer", async () => {
    const db = await createTestDb();
    const signerId = await makeSigner(db, "u2");
    await db.insert(selfies).values({
      signerId,
      status: "approved",
      displayBlobUrl: "b",
      thumbnailBlobUrl: "c",
      captureMethod: "live",
    });
    await expect(
      db.insert(selfies).values({
        signerId,
        status: "approved",
        displayBlobUrl: "e",
        thumbnailBlobUrl: "f",
        captureMethod: "live",
      }),
    ).rejects.toThrow();
  });

  it("allows multiple pending submissions per signer", async () => {
    const db = await createTestDb();
    const signerId = await makeSigner(db, "u3");
    for (let i = 0; i < 2; i++) {
      await db.insert(selfies).values({
        signerId,
        status: "pending",
        displayBlobUrl: `d${i}`,
        thumbnailBlobUrl: `t${i}`,
        captureMethod: "live",
      });
    }
    const rows = await db.select().from(selfies);
    expect(rows).toHaveLength(2);
  });

  it("allows a new approved selfie after the previous one is marked replaced", async () => {
    const db = await createTestDb();
    const signerId = await makeSigner(db, "u4");
    const [first] = await db
      .insert(selfies)
      .values({
        signerId,
        status: "approved",
        displayBlobUrl: "b",
        thumbnailBlobUrl: "c",
        captureMethod: "live",
      })
      .returning({ id: selfies.id });
    // Insert a second pending row first (it has no id yet to point back to);
    // then set first.replaced_by_selfie_id = second.id, then approve second.
    const [second] = await db
      .insert(selfies)
      .values({
        signerId,
        status: "pending",
        displayBlobUrl: "e",
        thumbnailBlobUrl: "f",
        captureMethod: "live",
      })
      .returning({ id: selfies.id });
    // Mark first as replaced
    await db.execute(
      `update selfies set replaced_by_selfie_id = '${second.id}' where id = '${first.id}'` as any,
    );
    // Now approving second must NOT violate the partial unique
    await db.execute(
      `update selfies set status = 'approved' where id = '${second.id}'` as any,
    );
    const approved = await db.select().from(selfies);
    expect(approved.filter((r: any) => r.status === "approved")).toHaveLength(2);
  });

  it("inserts a selfie_report and prevents duplicate reporter on same selfie", async () => {
    const db = await createTestDb();
    const owner = await makeSigner(db, "owner");
    const reporter = await makeSigner(db, "reporter");
    const [s] = await db
      .insert(selfies)
      .values({
        signerId: owner,
        status: "approved",
        displayBlobUrl: "b",
        thumbnailBlobUrl: "c",
        captureMethod: "live",
      })
      .returning({ id: selfies.id });
    await db.insert(selfieReports).values({
      selfieId: s.id,
      reporterSignerId: reporter,
    });
    await expect(
      db.insert(selfieReports).values({
        selfieId: s.id,
        reporterSignerId: reporter,
      }),
    ).rejects.toThrow();
  });
});
