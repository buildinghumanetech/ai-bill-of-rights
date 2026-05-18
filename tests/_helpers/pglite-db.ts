import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { sql } from "drizzle-orm";
import * as schema from "@/lib/db/schema";

export type TestDb = ReturnType<typeof drizzle<typeof schema>>;

/**
 * Returns an in-memory Postgres bound to drizzle with the Phase 1 schema applied.
 * Each call returns a fresh, isolated database.
 */
export async function createTestDb(): Promise<TestDb> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  // Apply Phase 1 schema via raw DDL (mirrors what drizzle-kit would generate)
  await db.execute(sql`
    create extension if not exists "uuid-ossp";

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
  `);
  return db;
}
