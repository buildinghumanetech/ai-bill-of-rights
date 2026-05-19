"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useRef,
} from "react";
import {
  initialLiveSignersState,
  liveSignersReducer,
  type LiveSignerEvent,
} from "./live-signers-reducer";

const POLL_INTERVAL_MS = 60 * 1000;

type ContextValue = {
  count: number;
  currentEvent: LiveSignerEvent | null;
  onEventFinished: () => void;
};

const LiveSignersContext = createContext<ContextValue | null>(null);

export function useLiveSigners(): ContextValue {
  const ctx = useContext(LiveSignersContext);
  if (ctx === null) {
    throw new Error("useLiveSigners must be used inside <LiveSignersProvider>");
  }
  return ctx;
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
  children,
}: {
  initialCount: number;
  children: React.ReactNode;
}) {
  const [state, dispatch] = useReducer(
    liveSignersReducer,
    initialCount,
    initialLiveSignersState,
  );

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
      }}
    >
      {children}
    </LiveSignersContext.Provider>
  );
}
