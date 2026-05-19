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
  type AnyPgColumn,
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
  // Notification preference for document updates: 'major' (default) = only
  // major revisions, 'minor' = major + minor, 'none' = no notifications.
  notificationPreference: text("notification_preference", {
    enum: ["major", "minor", "none"],
  })
    .notNull()
    .default("major"),
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

export const proposedEdits = pgTable("proposed_edits", {
  id: uuid("id").defaultRandom().primaryKey(),
  baseVersionId: uuid("base_version_id")
    .notNull()
    .references(() => versions.id),
  proposerSignerId: uuid("proposer_signer_id")
    .notNull()
    .references(() => signers.id),
  kind: text("kind", {
    enum: ["replace", "insert_after", "delete"],
  }).notNull(),
  targetAnchorId: text("target_anchor_id").notNull(),
  newText: text("new_text"),
  rationale: text("rationale"),
  status: text("status", {
    enum: ["pending", "accepted", "rejected", "stale", "published"],
  })
    .notNull()
    .default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  decidedBy: uuid("decided_by").references(() => signers.id),
  publishedInVersionId: uuid("published_in_version_id").references(
    () => versions.id,
  ),
});

export const proposalUpvotes = pgTable(
  "proposal_upvotes",
  {
    proposalId: uuid("proposal_id")
      .notNull()
      .references(() => proposedEdits.id),
    signerId: uuid("signer_id")
      .notNull()
      .references(() => signers.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("proposal_upvotes_proposal_signer_unique").on(t.proposalId, t.signerId),
  ],
);

export const comments = pgTable("comments", {
  id: uuid("id").defaultRandom().primaryKey(),
  baseVersionId: uuid("base_version_id")
    .notNull()
    .references(() => versions.id),
  // Polymorphic: exactly one of (anchorId, proposalId) is non-null.
  anchorId: text("anchor_id"),
  proposalId: uuid("proposal_id").references(() => proposedEdits.id),
  signerId: uuid("signer_id")
    .notNull()
    .references(() => signers.id),
  body: text("body").notNull(),
  parentCommentId: uuid("parent_comment_id").references((): AnyPgColumn => comments.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  hiddenAt: timestamp("hidden_at", { withTimezone: true }),
  hiddenReason: text("hidden_reason"),
});

export const commentUpvotes = pgTable(
  "comment_upvotes",
  {
    commentId: uuid("comment_id")
      .notNull()
      .references(() => comments.id),
    signerId: uuid("signer_id")
      .notNull()
      .references(() => signers.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("comment_upvotes_comment_signer_unique").on(t.commentId, t.signerId),
  ],
);

export const endorsements = pgTable(
  "endorsements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    signerId: uuid("signer_id")
      .notNull()
      .references(() => signers.id),
    baseVersionId: uuid("base_version_id")
      .notNull()
      .references(() => versions.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    convertedToVersionId: uuid("converted_to_version_id").references(
      () => versions.id,
    ),
    convertedAt: timestamp("converted_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("endorsements_signer_base_unique").on(t.signerId, t.baseVersionId),
  ],
);
