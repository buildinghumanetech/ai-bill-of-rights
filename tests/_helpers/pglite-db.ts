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

    create table endorsements (
      id uuid primary key default gen_random_uuid(),
      signer_id uuid not null references signers(id),
      base_version_id uuid not null references versions(id),
      created_at timestamptz not null default now(),
      converted_to_version_id uuid references versions(id),
      converted_at timestamptz
    );
    create unique index endorsements_signer_base_unique on endorsements (signer_id, base_version_id);
  `);
  return db;
}

