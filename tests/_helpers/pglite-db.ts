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
  `);
  return db;
}

