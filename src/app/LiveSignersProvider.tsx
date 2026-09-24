"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import {
  initialLiveSignersState,
  liveSignersReducer,
  type LiveSignerEvent,
} from "./live-signers-reducer";
import type { ViewerSignature } from "@/lib/viewer/signature";

const POLL_INTERVAL_MS = 60 * 1000;

type ContextValue = {
  count: number;
  currentEvent: LiveSignerEvent | null;
  onEventFinished: () => void;
  /**
   * The person looking at the page, when they have signed the current
   * version; null otherwise. Seeded by the server (root layout) on every
   * render, and set directly by SignModal the moment a signature succeeds, so
   * the page recognizes them before the refresh lands.
   */
  viewer: ViewerSignature | null;
  setViewer: (viewer: ViewerSignature | null) => void;
};

const LiveSignersContext = createContext<ContextValue | null>(null);

export function useLiveSigners(): ContextValue {
  const ctx = useContext(LiveSignersContext);
  if (ctx === null) {
    throw new Error("useLiveSigners must be used inside <LiveSignersProvider>");
  }
  return ctx;
}

/**
 * The same context, or null outside a provider. For components that can work
 * without it — SignModal only uses it to recognize the signer immediately, and
 * is rendered standalone in tests.
 */
export function useOptionalLiveSigners(): ContextValue | null {
  return useContext(LiveSignersContext);
}

type PollResponse = {
  count: number;
  newSigners: Array<{
    id: string;
    displayName: string;
    locationText: string | null;
    signedAt: string;
  }>;
};

function isValidPollResponse(json: unknown): json is PollResponse {
  if (typeof json !== "object" || json === null) return false;
  const o = json as Record<string, unknown>;
  return typeof o.count === "number" && Array.isArray(o.newSigners);
}

export function LiveSignersProvider({
  initialCount,
  initialViewer = null,
  children,
}: {
  initialCount: number;
  initialViewer?: ViewerSignature | null;
  children: React.ReactNode;
}) {
  const [state, dispatch] = useReducer(
    liveSignersReducer,
    initialCount,
    initialLiveSignersState,
  );

  // The server's answer wins whenever it changes (a router.refresh() after
  // signing, removing a signature or deleting the account re-renders the
  // layout with a fresh one). Compared by value: the prop is a new object on
  // every render, and an identity check would undo setViewer() each time.
  const [viewer, setViewer] = useState<ViewerSignature | null>(initialViewer);
  const initialViewerKey = initialViewer
    ? `${initialViewer.signerId}:${initialViewer.signerNumber}`
    : "";
  const [seenViewerKey, setSeenViewerKey] = useState(initialViewerKey);
  if (initialViewerKey !== seenViewerKey) {
    // Adjusting state during render when a prop changes, per
    // https://react.dev/learn/you-might-not-need-an-effect — an effect here
    // would paint one frame of the stale viewer first.
    setSeenViewerKey(initialViewerKey);
    setViewer(initialViewer);
  }

  // The reducer's `latestSignedAt` is the cursor we send on the next poll.
  // Hold it in a ref too so the polling closure always sees the latest value
  // without restarting the interval on every state change.
  const cursorRef = useRef<string | null>(null);
  useEffect(() => {
    cursorRef.current = state.latestSignedAt;
  }, [state.latestSignedAt]);

  const isFirstPollRef = useRef(true);

  const poll = useCallback(async (signal?: AbortSignal) => {
    const cursor = cursorRef.current;
    const url =
      cursor === null
        ? "/api/signers/recent"
        : `/api/signers/recent?since=${encodeURIComponent(cursor)}`;
    try {
      const res = await fetch(url, { cache: "no-store", signal });
      if (!res.ok) {
        console.error(
          "[live-signers] poll failed:",
          res.status,
          res.statusText,
        );
        return;
      }
      const json = await res.json();
      if (!isValidPollResponse(json)) {
        console.error("[live-signers] poll response shape invalid");
        return;
      }
      const isColdStart = isFirstPollRef.current;
      isFirstPollRef.current = false;
      dispatch({
        type: "poll-response",
        isColdStart,
        count: json.count,
        newSigners: json.newSigners,
      });
    } catch (err) {
      // AbortError on intentional cancellation is expected — don't log it.
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error("[live-signers] poll threw:", err);
    }
  }, []);

  // Mount: fire one immediate poll (cold-start), then poll on an interval.
  useEffect(() => {
    const controller = new AbortController();
    const signal = controller.signal;

    const doPoll = () => {
      void poll(signal);
    };

    doPoll();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") {
        doPoll();
      }
    }, POLL_INTERVAL_MS);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        // Catch up immediately when the tab refocuses.
        doPoll();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      controller.abort();
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      isFirstPollRef.current = true;
    };
  }, [poll]);

  const onEventFinished = useCallback(() => {
    dispatch({ type: "event-finished" });
  }, []);

  return (
    <LiveSignersContext.Provider
      value={{
        count: state.count,
        currentEvent: state.currentEvent,
        onEventFinished,
        viewer,
        setViewer,
      }}
    >
      {children}
    </LiveSignersContext.Provider>
  );
}
