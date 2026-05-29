interface Props {
  version: string;
  publishedAt: Date | string;
  changelogUrl?: string | null;
}

export function VersionBanner({ version, publishedAt, changelogUrl }: Props) {
  const date =
    typeof publishedAt === "string"
      ? new Date(publishedAt)
      : publishedAt;
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
      <span className="font-medium">v{version}</span>
      <span className="mx-2 text-zinc-400">·</span>
      <span>Published {date.toISOString().slice(0, 10)}</span>
      {changelogUrl ? (
        <>
          <span className="mx-2 text-zinc-400">·</span>
          <a
            href={changelogUrl}
            className="underline-offset-4 hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            Changelog
          </a>
        </>
      ) : null}
    </div>
  );
}
