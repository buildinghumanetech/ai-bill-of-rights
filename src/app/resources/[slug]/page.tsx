import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getResource, listResourceSlugs } from "@/lib/resources";

export async function generateStaticParams() {
  return listResourceSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const r = getResource(slug);
  if (!r) return { title: "Resource not found" };
  return {
    title: `${r.title} — AI Bill of Rights`,
    description: r.subtitle || r.title,
  };
}

export default async function ResourcePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const resource = getResource(slug);
  if (!resource) notFound();

  const paragraphs = resource.body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16 sm:py-24">
      <Link
        href="/"
        className="text-xs font-medium uppercase tracking-[0.25em] text-zinc-500 hover:text-zinc-900"
      >
        ← AI Bill of Rights
      </Link>

      <header className="mt-6 border-b border-zinc-200 pb-8">
        <h1 className="text-pretty text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
          {resource.title}
        </h1>
        {resource.subtitle ? (
          <p className="mt-3 text-lg leading-relaxed text-zinc-700">
            {resource.subtitle}
          </p>
        ) : null}
        {resource.sourceUrl ? (
          <p className="mt-4 text-sm text-zinc-500">
            Source:{" "}
            <a
              href={resource.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="break-all text-zinc-700 underline underline-offset-4 hover:text-zinc-900"
            >
              {resource.sourceUrl}
            </a>
          </p>
        ) : null}
      </header>

      <article className="mt-8">
        {paragraphs.length > 0 ? (
          paragraphs.map((p, i) => (
            <p
              key={i}
              className="mb-5 text-base leading-relaxed text-zinc-800"
            >
              {p}
            </p>
          ))
        ) : (
          <p className="text-sm italic text-zinc-500">
            (Abstract pending — fill this in by editing
            <code className="mx-1 rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs text-zinc-800">
              content/resources/{resource.slug}.md
            </code>
            .)
          </p>
        )}
      </article>
    </main>
  );
}
