import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/lib/admin/check";
import { getCurrentVersion } from "@/lib/db/queries";
import { listProposedRights } from "@/lib/db/proposal-queries";
import { getDb } from "@/lib/db/lazy";
import { AdminProposalActions } from "./AdminProposalActions";

export const dynamic = "force-dynamic";

export default async function AdminProposalsPage() {
  const ctx = await getCurrentAdmin();
  if (ctx.state !== "admin") redirect("/");

  const current = await getCurrentVersion().catch(() => null);
  const proposals = current
    ? await listProposedRights(getDb(), {
        baseVersionId: current.id,
        includeHidden: true,
      })
    : [];

  const pending = proposals.filter((p) => p.status === "pending" && !p.hiddenAt);
  const decided = proposals.filter((p) => p.status !== "pending" || p.hiddenAt);

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight text-zinc-950">
        Proposed rights
      </h1>
      <p className="mt-2 text-base text-zinc-600">
        New-article proposals filed against v{current?.version ?? "—"}.{" "}
        <Link href="/propose" className="text-blue-600 underline underline-offset-4">
          Public queue
        </Link>
      </p>

      <Section title={`Pending (${pending.length})`}>
        {pending.map((p) => (
          <Row key={p.id} p={p} />
        ))}
        {pending.length === 0 && <Empty>Nothing waiting.</Empty>}
      </Section>

      <Section title={`Decided and hidden (${decided.length})`}>
        {decided.map((p) => (
          <Row key={p.id} p={p} />
        ))}
        {decided.length === 0 && <Empty>Nothing yet.</Empty>}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
        {title}
      </h2>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded border border-dashed border-zinc-300 px-4 py-8 text-center text-sm text-zinc-500">
      {children}
    </p>
  );
}

function Row({ p }: { p: Awaited<ReturnType<typeof listProposedRights>>[number] }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-lg font-semibold text-zinc-950">{p.title}</h3>
        <span className="font-mono text-xs text-zinc-500">
          {p.upvoteCount} endorsements · {p.commentCount} comments · {p.status}
          {p.hiddenAt ? ` · hidden (${p.hiddenReason})` : ""}
        </span>
      </div>
      <p className="mt-1 text-sm text-zinc-500">
        {p.proposerDisplayName}
        {p.proposerAffiliation ? ` · ${p.proposerAffiliation}` : ""} ·{" "}
        {p.createdAt.toISOString().slice(0, 10)}
      </p>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-zinc-800">
        {p.body}
      </p>
      {p.pullQuote && (
        <p className="mt-2 text-sm font-semibold italic text-zinc-900">{p.pullQuote}</p>
      )}
      {p.rationale && (
        <p className="mt-3 border-l-2 border-zinc-300 pl-3 text-sm leading-relaxed text-zinc-600">
          {p.rationale}
        </p>
      )}
      <AdminProposalActions
        proposalId={p.id}
        status={p.status}
        isHidden={Boolean(p.hiddenAt)}
        markdown={renderPreview(p)}
      />
    </div>
  );
}

/**
 * Server-side markdown preview so the admin can copy the exact block to paste
 * into the next `content/bill-of-rights/<version>.md`. The number is a
 * placeholder (`N`) on purpose: which slot it takes is an editorial call made
 * when the version is assembled, not when it is accepted.
 */
function renderPreview(p: { title: string; body: string; pullQuote: string | null }) {
  const sentences = p.body
    .split(/(?<=[.!?])\s+(?=[A-Z"'“‘])/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (p.pullQuote) sentences.push(p.pullQuote);
  const body = sentences.map((s, i) => `${s} {#article-N-s-${i + 1}}`).join(" ");
  return `## Article N: ${p.title} {#article-N}\n\n${body}\n`;
}
