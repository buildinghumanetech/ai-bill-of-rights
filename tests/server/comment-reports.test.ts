import { describe, expect, it } from "vitest";
import { createTestDb } from "../_helpers/pglite-db";
import { syncVersions } from "@/lib/db/sync";
import { commentReports, comments, signers, versions } from "@/lib/db/schema";
import { reportComment, toggleReportComment } from "@/server/comments/reports";

const md = `---
version: 1.0.0
published_at: 2026-05-18
---
# T {#preamble}
x {#preamble-s-1}
`;

async function seed() {
  const db = await createTestDb();
  await syncVersions(db, [
    {
      version: "1.0.0",
      publishedAt: new Date(),
      markdown: md,
      agentsMd: "stub",
      specJson: "{}",
      isCurrent: true,
      gitCommitSha: null,
    },
  ]);
  const [v] = await db.select().from(versions);
  const [author] = await db
    .insert(signers)
    .values({
      clerkUserId: "author",
      displayName: "Author",
      affiliation: null,
      locationText: null,
      verificationMethod: "email",
      verifiedAt: new Date(),
    })
    .returning({ id: signers.id });
  const [reporter] = await db
    .insert(signers)
    .values({
      clerkUserId: "reporter",
      displayName: "Reporter",
      affiliation: null,
      locationText: null,
      verificationMethod: "email",
      verifiedAt: new Date(),
    })
    .returning({ id: signers.id });
  const [c] = await db
    .insert(comments)
    .values({
      baseVersionId: v.id,
      anchorId: "preamble-s-1",
      signerId: author.id,
      body: "controversial comment",
    })
    .returning({ id: comments.id });
  return { db, commentId: c.id, reporterId: reporter.id };
}

describe("reportComment", () => {
  it("inserts a report row and returns 'reported'", async () => {
    const { db, commentId, reporterId } = await seed();
    const res = await reportComment(db, { signerId: reporterId, commentId });
    expect(res.state).toBe("reported");
    const rows = await db.select().from(commentReports);
    expect(rows).toHaveLength(1);
    expect(rows[0].commentId).toBe(commentId);
    expect(rows[0].reporterSignerId).toBe(reporterId);
  });

  it("returns 'already_reported' when the same user reports twice (idempotent)", async () => {
    const { db, commentId, reporterId } = await seed();
    await reportComment(db, { signerId: reporterId, commentId });
    const res = await reportComment(db, { signerId: reporterId, commentId });
    expect(res.state).toBe("already_reported");
    // Only one row in DB
    const rows = await db.select().from(commentReports);
    expect(rows).toHaveLength(1);
  });

  it("allows different reporters to flag the same comment", async () => {
    const { db, commentId, reporterId } = await seed();
    // Create a second reporter
    const [reporter2] = await db
      .insert(signers)
      .values({
        clerkUserId: "reporter2",
        displayName: "Reporter2",
        affiliation: null,
        locationText: null,
        verificationMethod: "email",
        verifiedAt: new Date(),
      })
      .returning({ id: signers.id });

    await reportComment(db, { signerId: reporterId, commentId });
    const res = await reportComment(db, { signerId: reporter2.id, commentId });
    expect(res.state).toBe("reported");
    const rows = await db.select().from(commentReports);
    expect(rows).toHaveLength(2);
  });
});

describe("toggleReportComment", () => {
  it("inserts a report on first call and returns 'flagged'", async () => {
    const { db, commentId, reporterId } = await seed();
    const res = await toggleReportComment(db, { signerId: reporterId, commentId });
    expect(res.state).toBe("flagged");
    const rows = await db.select().from(commentReports);
    expect(rows).toHaveLength(1);
  });

  it("deletes the report on second call and returns 'unflagged'", async () => {
    const { db, commentId, reporterId } = await seed();
    await toggleReportComment(db, { signerId: reporterId, commentId });
    const res = await toggleReportComment(db, { signerId: reporterId, commentId });
    expect(res.state).toBe("unflagged");
    const rows = await db.select().from(commentReports);
    expect(rows).toHaveLength(0);
  });

  it("re-inserts the report on a third call (toggle back to flagged)", async () => {
    const { db, commentId, reporterId } = await seed();
    await toggleReportComment(db, { signerId: reporterId, commentId });
    await toggleReportComment(db, { signerId: reporterId, commentId });
    const res = await toggleReportComment(db, { signerId: reporterId, commentId });
    expect(res.state).toBe("flagged");
    const rows = await db.select().from(commentReports);
    expect(rows).toHaveLength(1);
  });
});
