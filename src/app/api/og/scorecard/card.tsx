import { NOT_ASSESSED, type ScorecardStatus } from "@/lib/scorecard";
import { OG_COLORS as C } from "../style";

/**
 * Shared chrome for the scorecard OG cards, in the same family as the signer
 * card at `src/app/api/og/signer/[id]/route.tsx`: light gray band, white body,
 * amber footer CTA, Geist, blue accent (see ../style.ts). No green: "Meets"
 * uses the site blue on these cards.
 *
 * These run through Satori, which supports a small subset of CSS — every node
 * with more than one child needs an explicit `display: flex`, and colours must
 * be literal hex, not Tailwind classes.
 */

export const OG_SIZE = { width: 1200, height: 630 } as const;

export const STATUS_SWATCH: Record<
  ScorecardStatus,
  { bg: string; fg: string; border: string; label: string }
> = {
  meets: {
    bg: "#dbeafe",
    fg: "#1e40af",
    border: "#93c5fd",
    label: "Meets",
  },
  partial: {
    bg: "#fef3c7",
    fg: "#92400e",
    border: "#fcd34d",
    label: "Partial",
  },
  "falls-short": {
    bg: "#ffe4e6",
    fg: "#9f1239",
    border: "#fda4af",
    label: "Falls short",
  },
  unclear: {
    bg: "#e0f2fe",
    fg: "#075985",
    border: "#7dd3fc",
    label: "Unclear",
  },
  [NOT_ASSESSED]: {
    bg: "#f4f4f5",
    fg: "#a1a1aa",
    border: "#e4e4e7",
    label: "Not assessed",
  },
};

export function Banner({
  eyebrow,
  title,
  badge,
}: {
  eyebrow: string;
  title: string;
  badge?: string | null;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: C.band,
        borderBottom: `1px solid ${C.bandBorder}`,
        height: 230,
        padding: "32px 60px",
      }}
    >
      <div
        style={{
          fontSize: 20,
          fontWeight: 600,
          color: C.tag,
          letterSpacing: 4,
          textTransform: "uppercase",
        }}
      >
        {eyebrow}
      </div>
      <div
        style={{
          fontSize: 54,
          fontWeight: 600,
          letterSpacing: -1,
          color: C.ink,
          marginTop: 6,
          textAlign: "center",
        }}
      >
        {title}
      </div>
      {badge ? (
        <div
          style={{
            display: "flex",
            marginTop: 14,
            padding: "6px 24px",
            background: C.blueTint,
            borderRadius: 9999,
            fontSize: 18,
            fontWeight: 600,
            color: C.blue,
            letterSpacing: 1,
          }}
        >
          {badge}
        </div>
      ) : null}
    </div>
  );
}

export function FooterCta({ text }: { text: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#fffbeb",
        borderTop: "2px solid #fde68a",
        padding: "14px 60px",
      }}
    >
      <div style={{ fontSize: 18, fontWeight: 600, color: "#92400e" }}>
        {text}
      </div>
    </div>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        fontFamily: "Geist",
        background: C.white,
      }}
    >
      {children}
    </div>
  );
}
