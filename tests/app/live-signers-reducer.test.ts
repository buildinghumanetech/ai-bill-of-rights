import { describe, it, expect } from "vitest";
import {
  liveSignersReducer,
  initialLiveSignersState,
  QUEUE_CAP,
  type LiveSignerEvent,
  type LiveSignersState,
} from "@/app/live-signers-reducer";

const ev = (id: string, signedAt: string): LiveSignerEvent => ({
  id,
  displayName: `User ${id}`,
  locationText: "Somewhere, US",
  signedAt,
});

describe("liveSignersReducer", () => {
  const start = initialLiveSignersState(7);

  it("initial state seeds count from prop, empties queue and currentEvent", () => {
    expect(start).toEqual({
      count: 7,
      queue: [],
      currentEvent: null,
      latestSignedAt: null,
    });
  });

  describe("poll-response cold-start", () => {
    it("with no new signers, updates count and leaves queue/currentEvent untouched", () => {
      const next = liveSignersReducer(start, {
        type: "poll-response",
        isColdStart: true,
        count: 9,
        newSigners: [],
      });
      expect(next.count).toBe(9);
      expect(next.queue).toEqual([]);
      expect(next.currentEvent).toBeNull();
      expect(next.latestSignedAt).toBeNull();
    });

    it("with several new signers, only the most recent becomes currentEvent; rest folded silently into count", () => {
      const newSigners = [
        ev("c", "2026-05-19T20:30:00Z"),
        ev("b", "2026-05-19T20:15:00Z"),
        ev("a", "2026-05-19T20:00:00Z"),
      ];
      const next = liveSignersReducer(start, {
        type: "poll-response",
        isColdStart: true,
        count: 10,
        newSigners,
      });
      expect(next.count).toBe(10);
      expect(next.currentEvent?.id).toBe("c");
      expect(next.queue).toEqual([]);
      expect(next.latestSignedAt).toBe("2026-05-19T20:30:00Z");
    });
  });

  describe("poll-response regular", () => {
    it("with several new signers, reverses to oldest-first, drains first to currentEvent, queues rest", () => {
      const newSigners = [
        ev("c", "2026-05-19T20:30:00Z"),
        ev("b", "2026-05-19T20:15:00Z"),
        ev("a", "2026-05-19T20:00:00Z"),
      ];
      const next = liveSignersReducer(start, {
        type: "poll-response",
        isColdStart: false,
        count: 10,
        newSigners,
      });
      expect(next.currentEvent?.id).toBe("a"); // oldest first
      expect(next.queue.map((e) => e.id)).toEqual(["b", "c"]);
      expect(next.latestSignedAt).toBe("2026-05-19T20:30:00Z");
    });

    it("does not displace a currentEvent that's still showing; appends to queue", () => {
      const stateWithCurrent: LiveSignersState = {
        ...start,
        currentEvent: ev("showing", "2026-05-19T19:55:00Z"),
      };
      const next = liveSignersReducer(stateWithCurrent, {
        type: "poll-response",
        isColdStart: false,
        count: 8,
        newSigners: [ev("a", "2026-05-19T20:00:00Z")],
      });
      expect(next.currentEvent?.id).toBe("showing");
      expect(next.queue.map((e) => e.id)).toEqual(["a"]);
    });

    it("respects QUEUE_CAP (cap at 5)", () => {
      const newSigners = Array.from({ length: 10 }, (_, i) =>
        ev(`s${i}`, `2026-05-19T20:${String(i).padStart(2, "0")}:00Z`),
      ).reverse(); // server returns newest-first
      const next = liveSignersReducer(start, {
        type: "poll-response",
        isColdStart: false,
        count: 100,
        newSigners,
      });
      // First drains to currentEvent; remaining queue length is at most QUEUE_CAP
      expect(next.queue.length).toBeLessThanOrEqual(QUEUE_CAP);
    });
  });

  describe("event-finished", () => {
    it("with non-empty queue, advances to next event", () => {
      const stateWithQueue: LiveSignersState = {
        ...start,
        currentEvent: ev("showing", "2026-05-19T20:00:00Z"),
        queue: [ev("next", "2026-05-19T20:05:00Z")],
      };
      const next = liveSignersReducer(stateWithQueue, { type: "event-finished" });
      expect(next.currentEvent?.id).toBe("next");
      expect(next.queue).toEqual([]);
    });

    it("with empty queue, clears currentEvent", () => {
      const state: LiveSignersState = {
        ...start,
        currentEvent: ev("last", "2026-05-19T20:00:00Z"),
      };
      const next = liveSignersReducer(state, { type: "event-finished" });
      expect(next.currentEvent).toBeNull();
    });
  });
});
