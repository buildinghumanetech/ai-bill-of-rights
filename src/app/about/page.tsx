export default function AboutPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-12">
      <p className="text-xs uppercase tracking-widest text-amber-700 dark:text-amber-400">
        Stub page
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">About</h1>
      <p className="mt-6 text-zinc-700 dark:text-zinc-300">
        The AI Bill of Rights was started by Erika Anderson (Building Humane
        Technology /{" "}
        <a
          href="https://humanebench.ai"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-zinc-900 underline underline-offset-4 hover:text-zinc-700 dark:text-zinc-100 dark:hover:text-zinc-300"
        >
          HumaneBench.ai
        </a>
        ) as a working document — a minimum viable demand — for what people
        deserve in their interactions with AI. The editorial council is
        currently a single editor; it will be expanded to a named, diverse
        group as the project grows.
      </p>
      <p className="mt-4 text-sm text-zinc-500">
        This page is intentionally a stub. Full content is forthcoming.
      </p>
    </main>
  );
}
