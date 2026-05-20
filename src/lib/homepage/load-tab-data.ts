import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { signers } from "@/lib/db/schema";
import {
  countProposalsByAnchor,
  listProposalsByAnchor,
  getAcceptedProposalsForVersion,
  getCurrentVersion,
  getMyEndorsementForVersion,
  countEndorsersForVersion,
  type ProposalRow,
} from "@/lib/db/queries";
import { getCurrentAdmin } from "@/lib/admin/check";

export interface HomepageTabData {
  currentVersion: string;
  proposedVersion: string;
  baseVersionId: string | null;
  proposalCounts: Record<string, { pending: number; accepted: number }>;
  proposalsByAnchor: Record<string, ProposalRow[]>;
  acceptedProposals: ProposalRow[];
  isAdmin: boolean;
  initialEndorsed: boolean;
  endorserCount: number;
}

function bumpPatch(version: string): string {
  const parts = version.split(".");
  if (parts.length < 3) return version;
  const patch = parseInt(parts[2] ?? "0", 10);
  return `${parts[0]}.${parts[1]}.${patch + 1}`;
}

/**
 * Loads every piece of data both the Current and Proposed tabs need so the
 * client-side `<TabbedDocument>` can render both views without an extra fetch
 * when the user toggles tabs. Always returns sensible defaults — preview
 * deployments with no DB will render an empty proposed view rather than crash.
 */
export async function loadHomepageTabData(): Promise<HomepageTabData> {
  const current = await getCurrentVersion().catch(() => null);
  const currentVersion = current?.version ?? "0.0.1";
  const proposedVersion = bumpPatch(currentVersion);

  const adminCtx = await getCurrentAdmin().catch(() => null);
  const isAdmin = adminCtx?.state === "admin";

  let proposalCounts: Record<string, { pending: number; accepted: number }> = {};
  const proposalsByAnchor: Record<string, ProposalRow[]> = {};
  let acceptedProposals: ProposalRow[] = [];
  let initialEndorsed = false;
  let endorserCount = 0;

  if (current) {
    try {
      proposalCounts = await countProposalsByAnchor(
        undefined as unknown as never,
        current.id,
      );

      const anchorIds = Object.keys(proposalCounts);
      await Promise.all(
        anchorIds.map(async (anchorId) => {
          proposalsByAnchor[anchorId] = await listProposalsByAnchor(
            undefined as unknown as never,
            current.id,
            anchorId,
          );
        }),
      );

      acceptedProposals = await getAcceptedProposalsForVersion(
        undefined as unknown as never,
        current.id,
      );

      endorserCount = await countEndorsersForVersion(
        undefined as unknown as never,
        current.id,
      );

      const { userId } = await auth().catch(() => ({ userId: null }));
      if (userId) {
        const { db: dbModule } = await import("@/lib/db");
        const signerRows = await dbModule
          .select({ id: signers.id })
          .from(signers)
          .where(eq(signers.clerkUserId, userId))
          .limit(1);
        if (signerRows[0]) {
          const e = await getMyEndorsementForVersion(
            undefined as unknown as never,
            signerRows[0].id,
            current.id,
          );
          initialEndorsed = Boolean(e);
        }
      }
    } catch {
      // DB unreachable — fall through with defaults.
    }
  }

  return {
    currentVersion,
    proposedVersion,
    baseVersionId: current?.id ?? null,
    proposalCounts,
    proposalsByAnchor,
    acceptedProposals,
    isAdmin,
    initialEndorsed,
    endorserCount,
  };
}
