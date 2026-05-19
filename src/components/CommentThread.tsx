import type { CommentTreeItem } from "@/lib/db/queries";
import { VerificationBadge } from "./VerificationBadge";
import { UpvoteButton } from "./UpvoteButton";
import { ReportModal } from "./ReportModal";
import { CommentComposer } from "./CommentComposer";

interface Props {
  comments: CommentTreeItem[];
  versionId: string;
  versionString: string;
  anchorId: string;
  depth?: number;
  parentId?: string | null;
  maxDepth?: number;
}

export function CommentThread({
  comments,
  versionId,
  versionString,
  anchorId,
  depth = 0,
  parentId = null,
  maxDepth = 4,
}: Props) {
  const children = comments.filter((c) => c.parentCommentId === parentId);
  if (children.length === 0) return null;

  return (
    <ul
      className={
        depth === 0
          ? "flex flex-col gap-4"
          : "mt-2 flex flex-col gap-3 border-l border-zinc-200 pl-4 dark:border-zinc-800"
      }
    >
      {children.map((c) => {
        const isHidden = c.hiddenAt !== null;
        const grandchildren = comments.filter((x) => x.parentCommentId === c.id);
        const collapse = depth + 1 > maxDepth;
        return (
          <li key={c.id}>
            <div className="rounded-md bg-zinc-50 p-3 text-sm dark:bg-zinc-900">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium">{c.displayName}</span>
                <VerificationBadge method={c.verificationMethod} />
                {c.locationText ? <span className="text-xs text-zinc-500">· {c.locationText}</span> : null}
                <span className="ml-auto text-xs text-zinc-500">
                  {new Date(c.createdAt).toISOString().slice(0, 16).replace("T", " ")}
                </span>
              </div>
              {isHidden ? (
                <p className="mt-2 italic text-zinc-500">[comment hidden by moderator]</p>
              ) : (
                <p className="mt-2 whitespace-pre-wrap text-zinc-800 dark:text-zinc-200">{c.body}</p>
              )}
              {!isHidden ? (
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                  <UpvoteButton commentId={c.id} count={c.upvoteCount} versionString={versionString} />
                  <ReportModal commentId={c.id} versionString={versionString} />
                </div>
              ) : null}
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-zinc-500">Reply</summary>
                <CommentComposer
                  versionId={versionId}
                  versionString={versionString}
                  anchorId={anchorId}
                  parentCommentId={c.id}
                />
              </details>
            </div>
            {grandchildren.length > 0 ? (
              collapse ? (
                <details className="ml-2 mt-1">
                  <summary className="cursor-pointer text-xs text-zinc-500">
                    Show {grandchildren.length} more {grandchildren.length === 1 ? "reply" : "replies"}
                  </summary>
                  <CommentThread
                    comments={comments}
                    versionId={versionId}
                    versionString={versionString}
                    anchorId={anchorId}
                    depth={depth + 1}
                    parentId={c.id}
                    maxDepth={maxDepth}
                  />
                </details>
              ) : (
                <CommentThread
                  comments={comments}
                  versionId={versionId}
                  versionString={versionString}
                  anchorId={anchorId}
                  depth={depth + 1}
                  parentId={c.id}
                  maxDepth={maxDepth}
                />
              )
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
