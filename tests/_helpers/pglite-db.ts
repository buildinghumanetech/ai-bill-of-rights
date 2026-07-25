import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "@/lib/db/schema";

export type TestDb = ReturnType<typeof drizzle<typeof schema>>;

/**
 * Returns an in-memory Postgres bound to drizzle with the Phase 1 schema applied.
 * Each call returns a fresh, isolated database.
 */
export async function createTestDb(): Promise<TestDb> {
  const client = new PGlite();
  await client.ready;
  const db = drizzle(client, { schema });
  // Apply Phase 1 schema via raw DDL (mirrors what drizzle-kit would generate).
  // Use client.exec() instead of db.execute(sql`...`) because pglite's prepared-
  // statement path rejects multi-command strings; exec() handles them correctly.
  await client.exec(`
    create table versions (
      id uuid primary key default gen_random_uuid(),
      version text not null,
      published_at timestamptz not null,
      markdown_hash text not null,
      agents_md_hash text not null,
      spec_json_hash text not null,
      parsed_json jsonb not null,
      is_current boolean not null default false,
      git_commit_sha text,
      is_user_fork boolean not null default false,
      parent_version_id uuid
    );
    create unique index versions_version_unique on versions (version);

    create table signers (
      id uuid primary key default gen_random_uuid(),
      clerk_user_id text not null unique,
      display_name text not null,
      affiliation text,
      location_text text,
      verification_method text not null check (verification_method in ('email','sms')),
      verified_at timestamptz not null,
      is_admin boolean not null default false,
      soft_banned_at timestamptz,
      notification_preference text not null default 'major' check (notification_preference in ('major','minor','none')),
      created_at timestamptz not null default now()
    );

    create table consent_records (
      id uuid primary key default gen_random_uuid(),
      signer_id uuid not null references signers(id),
      consented_at timestamptz not null default now(),
      consent_text_hash text not null,
      captured_fields jsonb,
      revoked_at timestamptz
    );

    create table signatures (
      id uuid primary key default gen_random_uuid(),
      signer_id uuid not null references signers(id),
      version_id uuid not null references versions(id),
      signed_at timestamptz not null default now(),
      version_hash_at_signing text not null,
      consent_record_id uuid not null references consent_records(id)
    );
    create unique index signatures_signer_version_unique
      on signatures (signer_id, version_id);
    create index signatures_signer_signed_at_idx
      on signatures (signer_id, signed_at desc);
    create index signatures_signed_at_idx
      on signatures (signed_at desc);

    create table proposed_edits (
      id uuid primary key default gen_random_uuid(),
      base_version_id uuid not null references versions(id),
      proposer_signer_id uuid not null references signers(id),
      kind text not null check (kind in ('replace','insert_after','delete')),
      target_anchor_id text not null,
      new_text text,
      rationale text,
      status text not null default 'pending' check (status in ('pending','accepted','rejected','stale','published')),
      created_at timestamptz not null default now(),
      decided_at timestamptz,
      decided_by uuid references signers(id),
      published_in_version_id uuid references versions(id)
    );

    create table proposal_upvotes (
      proposal_id uuid not null references proposed_edits(id),
      signer_id uuid not null references signers(id),
      created_at timestamptz not null default now(),
      primary key (proposal_id, signer_id)
    );

    create table comments (
      id uuid primary key default gen_random_uuid(),
      base_version_id uuid not null references versions(id),
      anchor_id text,
      proposal_id uuid references proposed_edits(id),
      signer_id uuid not null references signers(id),
      body text not null,
      selected_text text,
      parent_comment_id uuid references comments(id),
      created_at timestamptz not null default now(),
      hidden_at timestamptz,
      hidden_reason text
    );

    create table comment_upvotes (
      comment_id uuid not null references comments(id),
      signer_id uuid not null references signers(id),
      created_at timestamptz not null default now(),
      primary key (comment_id, signer_id)
    );

    create table comment_votes (
      id uuid primary key default gen_random_uuid(),
      comment_id uuid not null references comments(id),
      signer_id uuid not null references signers(id),
      direction smallint not null,
      created_at timestamptz not null default now()
    );
    create unique index comment_votes_comment_signer_unique
      on comment_votes (comment_id, signer_id);

    create table comment_reports (
      id uuid primary key default gen_random_uuid(),
      comment_id uuid not null references comments(id),
      reporter_signer_id uuid not null references signers(id),
      created_at timestamptz not null default now(),
      resolved_at timestamptz,
      resolved_by uuid references signers(id)
    );
    create unique index comment_reports_comment_reporter_unique
      on comment_reports (comment_id, reporter_signer_id);

    create table endorsements (
      id uuid primary key default gen_random_uuid(),
      signer_id uuid not null references signers(id),
      base_version_id uuid not null references versions(id),
      created_at timestamptz not null default now(),
      converted_to_version_id uuid references versions(id),
      converted_at timestamptz
    );
    create unique index endorsements_signer_base_unique on endorsements (signer_id, base_version_id);

    create table selfies (
      id uuid primary key default gen_random_uuid(),
      signer_id uuid not null references signers(id),
      status text not null check (status in ('pending','approved','rejected','auto_hidden','removed')),
      original_blob_url text not null,
      display_blob_url text not null,
      thumbnail_blob_url text not null,
      original_mime text not null,
      original_bytes integer not null,
      capture_method text not null check (capture_method in ('live','upload')),
      submitted_at timestamptz not null default now(),
      reviewed_at timestamptz,
      reviewed_by uuid,
      rejection_reason text,
      rejection_note text,
      auto_hidden_at timestamptz,
      removed_at timestamptz,
      replaced_by_selfie_id uuid
    );
    create index selfies_signer_id_idx on selfies (signer_id);
    create unique index selfies_signer_active_unique on selfies (signer_id)
      where status = 'approved'
        and auto_hidden_at is null
        and removed_at is null
        and replaced_by_selfie_id is null;
    create index selfies_status_submitted_at_idx
      on selfies (status, submitted_at desc)
      where status = 'pending';

    create table selfie_reports (
      id uuid primary key default gen_random_uuid(),
      selfie_id uuid not null references selfies(id),
      reporter_signer_id uuid not null references signers(id),
      reason text,
      created_at timestamptz not null default now(),
      resolved_at timestamptz,
      resolved_by uuid,
      resolution text check (resolution in ('allowed','hidden'))
    );
    create unique index selfie_reports_selfie_reporter_unique
      on selfie_reports (selfie_id, reporter_signer_id);
    create index selfie_reports_selfie_unresolved_idx
      on selfie_reports (selfie_id)
      where resolved_at is null;

    create table comment_mentions (
      id uuid primary key default gen_random_uuid(),
      comment_id uuid not null references comments(id),
      mentioned_signer_id uuid not null references signers(id),
      created_at timestamptz not null default now()
    );
    create unique index comment_mentions_unique
      on comment_mentions (comment_id, mentioned_signer_id);

    create table attestations (
      id uuid primary key default gen_random_uuid(),
      org_name text not null,
      product_name text not null,
      product_url text,
      version_id uuid not null references versions(id),
      contact_email text not null,
      verification_token text not null unique,
      claimed_at timestamptz not null default now(),
      email_verified_at timestamptz,
      needs_manual_review boolean not null default false,
      manually_reviewed_at timestamptz,
      manually_approved boolean,
      published boolean not null default false,
      hidden_at timestamptz
    );
    create index attestations_version_published
      on attestations (version_id) where published = true;
  `);
  return db;
}

