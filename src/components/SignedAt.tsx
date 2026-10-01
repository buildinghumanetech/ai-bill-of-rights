"use client";

import { useEffect, useState } from "react";

function format(d: Date): string {
  const date = d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const time = d
    .toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
    .toLowerCase()
    .replace(/\s+/g, "");
  return `${date} at ${time}`;
}

export default function SignedAt({ iso }: { iso: string }) {
  const date = new Date(iso);
  const [text, setText] = useState<string>(() => format(date));

  useEffect(() => {
    // Intentional, and the point of this component: the server has no timezone so it
    // renders UTC, and the client must re-format in local time once mounted. That is a
    // post-hydration correction — what an effect is for. Hence suppressHydrationWarning
    // on the <time> below.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setText(format(new Date(iso)));
  }, [iso]);

  return (
    <time dateTime={iso} suppressHydrationWarning>
      {text}
    </time>
  );
}
