import type { Metadata } from "next";
import { UnsubscribeConfirm } from "./UnsubscribeConfirm";

export const metadata: Metadata = {
  title: "Unsubscribe",
  robots: { index: false, follow: false },
};

export default async function UnsubscribePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ done?: string; invalid?: string }>;
}) {
  const { token } = await params;
  const { done, invalid } = await searchParams;
  const initial = done ? "done" : invalid ? "invalid" : "working";
  return (
    <main className="mx-auto w-full max-w-xl px-6 py-24">
      <UnsubscribeConfirm token={token} initial={initial} />
    </main>
  );
}
