import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "../_helpers/pglite-db";
import { syncVersions } from "@/lib/db/sync";
import {
  listCommentsForVersion,
  countCommentsByAnchor,
} from "@/lib/db/queries";
import { comments, consentRecords, signers, versions } from "@/lib/db/schema";

/**
 * drizzle/0008 carries the existing discussion forward from v0.0.1 to v0.1.0.
 *
 * Comments are scoped to the version row they were written against, and the
 * homepage filters on the CURRENT version — so without this migration,
 * publishing v0.1.0 hides every existing thread. These tests run the real SQL
 * file (not a reimplementation of it) against an in-memory Postgres.
 */

const MIGRATION = path.join(
  process.cwd(),
  "drizzle",
  "0008_repoint_comments_to_v0_1_0.sql",
);

/** Run the migration file the same way scripts/apply-migration.ts does. */
async function applyMigration(db: TestDb) {
  const raw = fs.readFileSync(MIGRATION, "utf-8");
  const statements = raw
    .split("--> statement-breakpoint")
    .map((s) =>
      s
        .split("\n")
        .filter((line) => !line.trim().startsWith("--"))
        .join("\n")
        .trim()
        .replace(/;$/, "")
        .trim(),
    )
    .filter((s) => s.length > 0);
  expect(statements.length).toBeGreaterThan(0);
  for (const statement of statements) {
    await db.execute(statement as never);
  }
}

const doc = (version: string) => ({
  version,
  publishedAt: new Date(),
  markdown: `---\nversion: ${version}\n---\n# T {#preamble}\nx {#preamble-s-1}\n`,
  agentsMd: "stub",
  specJson: "{}",
  isCurrent: false,
  gitCommitSha: null,
});

async function seedCommentOnVersion(
  db: TestDb,
  versionString: string,
  body: string,
  anchorId: string,
) {
  const [signer] = await db
    .insert(signers)
    .values({
      clerkUserId: `u-${body}`,
      displayName: `Author of ${body}`,
      affiliation: null,
      locationText: null,
      verificationMethod: "email" as const,
      verifiedAt: new Date("2026-01-01T00:00:00Z"),
    })
    .returning({ id: signers.id });
  await db.insert(consentRecords).values({
    signerId: signer.id,
    consentTextHash: "a".repeat(64),
    capturedFields: {},
  });
  const [row] = await db
    .select()
    .from(versions)
    .where(eq(versions.version, versionString))
    .limit(1);
  await db.insert(comments).values({
    baseVersionId: row.id,
    anchorId,
    signerId: signer.id,
    body,
  });
}

/** Seed both versions with a comment written against the old one. */
async function seedPublishedUpgrade() {
  const db = await createTestDb();
  await syncVersions(db, [
    { ...doc("0.0.1"), isCurrent: false },
    { ...doc("0.1.0"), isCurrent: true },
  ]);
  await seedCommentOnVersion(db, "0.0.1", "old-thread", "article-1-s-1");
  const [current] = await db
    .select()
    .from(versions)
    .where(eq(versions.version, "0.1.0"))
    .limit(1);
  return { db, currentId: current.id };
}

describe("0008 repoint comments to the new current version", () => {
  it("hides the existing thread without the migration (the bug it fixes)", async () => {
    const { db, currentId } = await seedPublishedUpgrade();
    const visible = await listCommentsForVersion(db, currentId);
    expect(visible).toHaveLength(0);
  });

  it("makes the existing thread visible on the new current version", async () => {
    const { db, currentId } = await seedPublishedUpgrade();
    await applyMigration(db);

    const visible = await listCommentsForVersion(db, currentId);
    expect(visible.map((c) => c.body)).toEqual(["old-thread"]);
    // The anchor is untouched, so per-anchor counts resolve too.
    expect(await countCommentsByAnchor(db, currentId)).toEqual({
      "article-1-s-1": 1,
    });
  });

  it("leaves comments already on the new version alone", async () => {
    const { db, currentId } = await seedPublishedUpgrade();
    await seedCommentOnVersion(db, "0.1.0", "new-thread", "article-11-s-1");
    await applyMigration(db);

    const visible = await listCommentsForVersion(db, currentId);
    expect(visible.map((c) => c.body).sort()).toEqual([
      "new-thread",
      "old-thread",
    ]);
  });

  it("is safe to run twice", async () => {
    const { db, currentId } = await seedPublishedUpgrade();
    await applyMigration(db);
    await applyMigration(db);

    const visible = await listCommentsForVersion(db, currentId);
    expect(visible.map((c) => c.body)).toEqual(["old-thread"]);
  });

  it("is a no-op when the new version row does not exist yet", async () => {
    // sync-versions runs on postbuild; if the migration is run first, it must
    // not throw or blank out base_version_id.
    const db = await createTestDb();
    await syncVersions(db, [{ ...doc("0.0.1"), isCurrent: true }]);
    await seedCommentOnVersion(db, "0.0.1", "only-thread", "article-1-s-1");
    const [old] = await db
      .select()
      .from(versions)
      .where(eq(versions.version, "0.0.1"))
      .limit(1);

    await applyMigration(db);

    const stillThere = await listCommentsForVersion(db, old.id);
    expect(stillThere.map((c) => c.body)).toEqual(["only-thread"]);
  });
});
