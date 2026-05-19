export type LiveSignerEvent = {
  id: string;
  displayName: string;
  locationText: string | null;
  signedAt: string;
};

export type LiveSignersState = {
  count: number;
  queue: LiveSignerEvent[];
  currentEvent: LiveSignerEvent | null;
  latestSignedAt: string | null;
};

export type LiveSignersAction =
  | {
      type: "poll-response";
      isColdStart: boolean;
      count: number;
      newSigners: LiveSignerEvent[];
    }
  | { type: "event-finished" };

export const QUEUE_CAP = 5;

export function initialLiveSignersState(count: number): LiveSignersState {
  return { count, queue: [], currentEvent: null, latestSignedAt: null };
}

export function liveSignersReducer(
  state: LiveSignersState,
  action: LiveSignersAction,
): LiveSignersState {
  switch (action.type) {
    case "poll-response": {
      const { count, newSigners, isColdStart } = action;

      // Server returns newest-first. We want the queue ordered oldest-first
      // (so older sign events play before newer ones).
      const oldestFirst = [...newSigners].reverse();

      // Compute the cursor: newest signedAt in this response, if any.
      const newestInBatch =
        newSigners.length > 0 ? newSigners[0].signedAt : null;
      const latestSignedAt = newestInBatch ?? state.latestSignedAt;

      // Decide what to enqueue.
      const toEnqueue: LiveSignerEvent[] = isColdStart
        ? // Cold-start: only replay the single most recent signer.
          newSigners.length > 0
          ? [newSigners[0]]
          : []
        : oldestFirst;

      // Drain head to currentEvent if banner is idle.
      let newCurrent = state.currentEvent;
      let restToQueue = toEnqueue;
      if (newCurrent === null && toEnqueue.length > 0) {
        newCurrent = toEnqueue[0];
        restToQueue = toEnqueue.slice(1);
      }

      const newQueue = [...state.queue, ...restToQueue].slice(0, QUEUE_CAP);

      return {
        count,
        queue: newQueue,
        currentEvent: newCurrent,
        latestSignedAt,
      };
    }

    case "event-finished": {
      if (state.queue.length > 0) {
        const [next, ...rest] = state.queue;
        return { ...state, currentEvent: next, queue: rest };
      }
      return { ...state, currentEvent: null };
    }

    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}
