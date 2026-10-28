import { describe, it, expect } from "vitest";
import { isDeadTentative } from "./calendar-data";

describe("isDeadTentative — which penciled-in estimates fall off the calendar", () => {
  it("keeps a live sent proposal", () => {
    expect(isDeadTentative({ status: "sent", proposal_status: "sent" })).toBe(false);
  });

  it("drops a rejected estimate", () => {
    expect(isDeadTentative({ status: "rejected" })).toBe(true);
  });

  it("drops a client-declined proposal even when status is still 'sent'", () => {
    expect(isDeadTentative({ status: "sent", proposal_status: "declined" })).toBe(true);
  });

  it("keeps a stale, un-rejected estimate (expiry alone does NOT drop it)", () => {
    // The shop may extend the dates rather than kill a lapsed-but-live estimate.
    expect(isDeadTentative({ status: "sent", proposal_status: "sent" })).toBe(false);
  });

  it("handles missing fields as live", () => {
    expect(isDeadTentative({})).toBe(false);
  });
});
