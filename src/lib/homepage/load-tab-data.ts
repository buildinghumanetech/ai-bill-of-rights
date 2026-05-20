import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import {
  getCurrentVersion,
  listCommentsByAnchorForVersion,
  listThreadedCommentsForVersion,
  listSignersForAdminPostAs,
  type CommentWithSelection,
  type ThreadedComment,
  type SignerForAdminPostAs,
} from "@/lib/db/queries";
import { signers } from "@/lib/db/schema";

export interface HomepageTabData {
  currentVersion: string;
  proposedVersion: string;
  baseVersionId: string | null;
  /** @deprecated Use threadedComments instead. Kept for commentsByAnchor lookup. */
  comments: CommentWithSelection[];
  commentsByAnchor: Record<string, CommentWithSelection[]>;
  threadedComments: ThreadedComment[];
  viewerSignerId: string | null;
  isAdmin: boolean;
  /** Non-null only when the viewer is an admin. Used for "post as" dropdown. */
  signersForAdmin: SignerForAdminPostAs[];
}

function bumpPatch(version: string): string {
  const parts = version.split(".");
  if (parts.length < 3) return version;
  const patch = parseInt(parts[2] ?? "0", 10);
  return `${parts[0]}.${parts[1]}.${patch + 1}`;
}

/**
 * Resolves the data both Current and Proposed tabs need at request time so
 * `<TabbedDocument>` can render either initial tab without further fetching.
 * Returns sensible defaults when the DB is unreachable (preview/test builds).
 */
export async function loadHomepageTabData(): Promise<HomepageTabData> {
  const current = await getCurrentVersion().catch(() => null);
  const currentVersion = current?.version ?? "0.0.1";
  const proposedVersion = bumpPatch(currentVersion);
  const baseVersionId = current?.id ?? null;

  // Resolve the viewer's signer record (for vote attribution)
  let viewerSignerId: string | null = null;
  let isAdmin = false;
  try {
    const { userId } = await auth();
    if (userId && baseVersionId) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { db } = require("@/lib/db") as { db: any };
      const me = await db
        .select({ id: signers.id, isAdmin: signers.isAdmin })
        .from(signers)
        .where(eq(signers.clerkUserId, userId))
        .limit(1);
      if (me.length > 0) {
        viewerSignerId = me[0].id;
        isAdmin = Boolean(me[0].isAdmin);
      }
    }
  } catch {
    // auth() throws in certain edge cases (middleware not installed, etc.)
  }

  let comments: CommentWithSelection[] = [];
  let commentsByAnchor: Record<string, CommentWithSelection[]> = {};
  let threadedComments: ThreadedComment[] = [];
  let signersForAdmin: SignerForAdminPostAs[] = [];

  if (baseVersionId) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { db } = require("@/lib/db") as { db: any };
      const tasks: Promise<any>[] = [
        listCommentsByAnchorForVersion(db, baseVersionId),
        listThreadedCommentsForVersion(db, baseVersionId, viewerSignerId),
      ];
      if (isAdmin) tasks.push(listSignersForAdminPostAs(db));
      const results = await Promise.all(tasks);
      [commentsByAnchor, threadedComments] = results as [typeof commentsByAnchor, typeof threadedComments];
      if (isAdmin) signersForAdmin = results[2] as SignerForAdminPostAs[];
      // Build a flat list for legacy anchor lookups
      comments = Object.values(commentsByAnchor).flat();
    } catch {
      // DB unavailable — serve empty maps so page still renders
    }
  }

  return {
    currentVersion,
    proposedVersion,
    baseVersionId,
    comments,
    commentsByAnchor,
    threadedComments,
    viewerSignerId,
    isAdmin,
    signersForAdmin,
  };
}
