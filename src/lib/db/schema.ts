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
  integer,
  smallint,
  index,
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
    // Supports the DISTINCT ON (signer_id) ... ORDER BY signer_id, signed_at DESC
    // scan behind listSignatures (/signers, /signatories — both force-dynamic),
    // and the earlier-signature NOT EXISTS probe in listRecentSignersSince.
    // The unique index above leads with signer_id but has no signed_at, so
    // neither sort could be satisfied by an index scan without this.
    index("signatures_signer_signed_at_idx").on(
      t.signerId,
      t.signedAt.desc(),
    ),
    // The ticker's driving predicate is `signed_at > cutoff` with no signer_id
    // restriction, so the index above (leading with signer_id) cannot serve it.
    index("signatures_signed_at_idx").on(t.signedAt.desc()),
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
  selectedText: text("selected_text"),
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

export const commentVotes = pgTable(
  "comment_votes",
  {
    id: uuid("id").primaryKey().defaultRandom().notNull(),
    commentId: uuid("comment_id").notNull().references(() => comments.id),
    signerId: uuid("signer_id").notNull().references(() => signers.id),
    direction: smallint("direction").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("comment_votes_comment_signer_unique").on(t.commentId, t.signerId),
  ],
);

export const commentReports = pgTable(
  "comment_reports",
  {
    id: uuid("id").primaryKey().defaultRandom().notNull(),
    commentId: uuid("comment_id").notNull().references(() => comments.id),
    reporterSignerId: uuid("reporter_signer_id").notNull().references(() => signers.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedBy: uuid("resolved_by").references(() => signers.id),
  },
  (t) => [
    uniqueIndex("comment_reports_comment_reporter_unique").on(t.commentId, t.reporterSignerId),
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

// Selfies: optional photo per signer, admin-moderated. The active selfie
// for a signer is the row matching status='approved' with all hidden/removed/
// replaced timestamps NULL. The partial-unique index enforcing
// "at most one active per signer" is hand-written in the migration SQL
// (CREATE UNIQUE INDEX ... WHERE ...). Drizzle 0.36's partial-unique surface
// is fragile — same trade-off as versions.is_current at the top of this file.
export const selfies = pgTable(
  "selfies",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    signerId: uuid("signer_id")
      .notNull()
      .references(() => signers.id),
    // 'pending' | 'approved' | 'rejected' | 'auto_hidden' | 'removed'
    status: text("status").notNull(),
    originalBlobUrl: text("original_blob_url").notNull(),
    displayBlobUrl: text("display_blob_url").notNull(),
    thumbnailBlobUrl: text("thumbnail_blob_url").notNull(),
    // Always 'image/jpeg' in MVP (we re-encode originals to JPEG); column
    // exists so future formats (e.g. AVIF) don't require a migration.
    originalMime: text("original_mime").notNull(),
    originalBytes: integer("original_bytes").notNull(),
    // 'live' | 'upload'
    captureMethod: text("capture_method").notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedBy: uuid("reviewed_by"),
    // 'not_a_face' | 'offensive' | 'imposter' | 'pii_overlay' | 'other'
    rejectionReason: text("rejection_reason"),
    rejectionNote: text("rejection_note"),
    autoHiddenAt: timestamp("auto_hidden_at", { withTimezone: true }),
    removedAt: timestamp("removed_at", { withTimezone: true }),
    replacedBySelfieId: uuid("replaced_by_selfie_id"),
  },
  (t) => [index("selfies_signer_id_idx").on(t.signerId)],
);

export const selfieReports = pgTable(
  "selfie_reports",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    selfieId: uuid("selfie_id")
      .notNull()
      .references(() => selfies.id),
    reporterSignerId: uuid("reporter_signer_id")
      .notNull()
      .references(() => signers.id),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedBy: uuid("resolved_by"),
    // 'allowed' | 'hidden'
    resolution: text("resolution"),
  },
  (t) => [
    uniqueIndex("selfie_reports_selfie_reporter_unique").on(
      t.selfieId,
      t.reporterSignerId,
    ),
  ],
);
export const commentMentions = pgTable(
  "comment_mentions",
  {
    id: uuid("id").primaryKey().defaultRandom().notNull(),
    commentId: uuid("comment_id").notNull().references(() => comments.id),
    mentionedSignerId: uuid("mentioned_signer_id").notNull().references(() => signers.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("comment_mentions_unique").on(t.commentId, t.mentionedSignerId),
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
