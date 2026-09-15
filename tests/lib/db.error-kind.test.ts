import { describe, expect, it } from "vitest";
import { classifyDbError } from "@/lib/db/error-kind";

/**
 * The bug these guard: `/propose` selects a column added by drizzle/0011, and
 * migrations here are applied by hand. Before this classifier a bare `catch {}`
 * turned "the migration has not run", "the database is down" and "the queue is
 * genuinely empty" into one identical screen.
 */
describe("classifyDbError", () => {
  it("reads a missing column as a schema problem, by SQLSTATE", () => {
    const err = Object.assign(new Error('column "title" does not exist'), {
      code: "42703",
    });
    expect(classifyDbError(err)).toBe("schema");
  });

  it("reads a missing table as a schema problem", () => {
    const err = Object.assign(new Error('relation "proposed_edits" does not exist'), {
      code: "42P01",
    });
    expect(classifyDbError(err)).toBe("schema");
  });

  it("still catches a missing column when the code was lost crossing a boundary", () => {
    expect(classifyDbError(new Error('column "title" does not exist'))).toBe("schema");
  });

  it("reads SQLSTATE class 08 as a connection problem", () => {
    const err = Object.assign(new Error("server closed the connection"), {
      code: "08006",
    });
    expect(classifyDbError(err)).toBe("connection");
  });

  it("reads a Node socket error as a connection problem", () => {
    const err = Object.assign(new Error("connect ECONNREFUSED"), {
      code: "ECONNREFUSED",
    });
    expect(classifyDbError(err)).toBe("connection");
  });

  it("unwraps the Neon HTTP driver's wrapped fetch failure", () => {
    const inner = Object.assign(new Error("fetch failed"), { code: "ENOTFOUND" });
    const outer = new Error("Error connecting to database", { cause: inner });
    expect(classifyDbError(outer)).toBe("connection");
  });

  it("treats an unset DATABASE_URL as unavailable, not as an empty queue", () => {
    expect(
      classifyDbError(new Error("DATABASE_URL is not set. Copy .env.example ...")),
    ).toBe("connection");
  });

  it("prefers a schema code over connection-ish words in the message", () => {
    const err = Object.assign(
      new Error('column "title" does not exist (connection pool)'),
      { code: "42703" },
    );
    expect(classifyDbError(err)).toBe("schema");
  });

  it("returns unknown for an unrelated failure rather than guessing", () => {
    expect(classifyDbError(new Error("boom"))).toBe("unknown");
    expect(classifyDbError(null)).toBe("unknown");
    expect(classifyDbError("a string")).toBe("unknown");
  });

  it("survives a cyclic cause chain", () => {
    const a = new Error("a") as Error & { cause?: unknown };
    const b = new Error("b") as Error & { cause?: unknown };
    a.cause = b;
    b.cause = a;
    expect(classifyDbError(a)).toBe("unknown");
  });
});
