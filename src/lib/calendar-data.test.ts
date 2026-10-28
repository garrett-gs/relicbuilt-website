import { describe, it, expect } from "vitest";
import { isDeadTentative } from "./calendar-data";

const NOW = new Date("2026-06-15T12:00:00Z").getTime();
const PAST = "2026-05-01T00:00:00Z";
const FUTURE = "2026-12-01T00:00:00Z";

describe("isDeadTentative — which penciled-in estimates fall off the calendar", () => {
  it("keeps a live sent proposal", () => {
    expect(isDeadTentative({ status: "sent", proposal_status: "sent", now: NOW })).toBe(false);
  });

  it("drops a rejected estimate", () => {
    expect(isDeadTentative({ status: "rejected", now: NOW })).toBe(true);
  });

  it("drops a client-declined proposal even when status is still 'sent'", () => {
    expect(isDeadTentative({ status: "sent", proposal_status: "declined", now: NOW })).toBe(true);
  });

  it("drops a proposal that expired without acceptance", () => {
    expect(isDeadTentative({ status: "sent", proposal_status: "sent", proposal_expires_at: PAST, now: NOW })).toBe(true);
  });

  it("keeps a sent proposal whose expiry is still in the future", () => {
    expect(isDeadTentative({ status: "sent", proposal_status: "sent", proposal_expires_at: FUTURE, now: NOW })).toBe(false);
  });

  it("keeps an approved proposal even if past its expiry", () => {
    expect(isDeadTentative({ status: "sent", proposal_status: "approved", proposal_expires_at: PAST, now: NOW })).toBe(false);
  });

  it("keeps an accepted estimate even if past its expiry", () => {
    expect(isDeadTentative({ status: "accepted", proposal_expires_at: PAST, now: NOW })).toBe(false);
  });

  it("handles missing fields as live", () => {
    expect(isDeadTentative({})).toBe(false);
  });
});
