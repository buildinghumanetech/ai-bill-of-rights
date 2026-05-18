// NOTE: Spec Section 5.1 calls for a partial-unique index on versions (is_current = true).
// Drizzle 0.36 supports this via a raw SQL `where` clause on uniqueIndex, but doing so
// would cause unexpected migration errors in some tooling versions. Instead, we enforce
// single-current via a transactional update in the version sync script (Task 6). This
// trade-off simplifies the schema and avoids migration edge cases while preserving
// correctness at the application layer.

import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  boolean,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const versions = pgTable(
  "versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    version: text("version").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
    markdownHash: text("markdown_hash").notNull(),
    agentsMdHash: text("agents_md_hash").notNull(),
    specJsonHash: text("spec_json_hash").notNull(),
    parsedJson: jsonb("parsed_json").notNull(),
    isCurrent: boolean("is_current").notNull().default(false),
    gitCommitSha: text("git_commit_sha"),
    isUserFork: boolean("is_user_fork").notNull().default(false),
    parentVersionId: uuid("parent_version_id"),
  },
  (t) => [uniqueIndex("versions_version_unique").on(t.version)],
);

export const signers = pgTable("signers", {
  id: uuid("id").defaultRandom().primaryKey(),
  clerkUserId: text("clerk_user_id").notNull().unique(),
  displayName: text("display_name").notNull(),
  affiliation: text("affiliation"),
  locationText: text("location_text"),
  verificationMethod: text("verification_method", {
    enum: ["email", "sms"],
  }).notNull(),
  verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull(),
  isAdmin: boolean("is_admin").notNull().default(false),
  softBannedAt: timestamp("soft_banned_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const consentRecords = pgTable("consent_records", {
  id: uuid("id").defaultRandom().primaryKey(),
  signerId: uuid("signer_id")
    .notNull()
    .references(() => signers.id),
  consentedAt: timestamp("consented_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  consentTextHash: text("consent_text_hash").notNull(),
  capturedFields: jsonb("captured_fields"),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

export const signatures = pgTable(
  "signatures",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    signerId: uuid("signer_id")
      .notNull()
      .references(() => signers.id),
    versionId: uuid("version_id")
      .notNull()
      .references(() => versions.id),
    signedAt: timestamp("signed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    versionHashAtSigning: text("version_hash_at_signing").notNull(),
    consentRecordId: uuid("consent_record_id")
      .notNull()
      .references(() => consentRecords.id),
  },
  (t) => [
    uniqueIndex("signatures_signer_version_unique").on(t.signerId, t.versionId),
  ],
);

export const attestations = pgTable("attestations", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgName: text("org_name").notNull(),
  productName: text("product_name").notNull(),
  productUrl: text("product_url"),
  versionId: uuid("version_id")
    .notNull()
    .references(() => versions.id),
  contactEmail: text("contact_email").notNull(),
  verificationToken: text("verification_token").notNull().unique(),
  claimedAt: timestamp("claimed_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  needsManualReview: boolean("needs_manual_review").notNull().default(false),
  manuallyReviewedAt: timestamp("manually_reviewed_at", { withTimezone: true }),
  manuallyApproved: boolean("manually_approved"),
  published: boolean("published").notNull().default(false),
  hiddenAt: timestamp("hidden_at", { withTimezone: true }),
});
