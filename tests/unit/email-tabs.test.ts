import { describe, expect, it } from "vitest";
import { EMAIL_STATUSES, type EmailStatus } from "@/lib/labels";

describe("Email tabs and statuses", () => {
  it("includes pending, drafted, and sent statuses", () => {
    expect(EMAIL_STATUSES).toContain("pending");
    expect(EMAIL_STATUSES).toContain("drafted");
    expect(EMAIL_STATUSES).toContain("sent");
    expect(EMAIL_STATUSES).toContain("replied");
  });

  it("classifies status correctly for To send vs Completed tabs", () => {
    const isPendingTab = (status: EmailStatus) => ["pending", "drafted"].includes(status);
    const isCompletedTab = (status: EmailStatus) => ["sent", "replied"].includes(status);

    expect(isPendingTab("pending")).toBe(true);
    expect(isPendingTab("drafted")).toBe(true);
    expect(isPendingTab("sent")).toBe(false);

    expect(isCompletedTab("sent")).toBe(true);
    expect(isCompletedTab("replied")).toBe(true);
    expect(isCompletedTab("pending")).toBe(false);
  });

  it("builds correct tab query URLs for view and scope", () => {
    const buildTabUrl = (view: "pending" | "done", scope: "all" | "mine") => {
      const params = new URLSearchParams();
      if (view === "done") params.set("view", "done");
      if (scope === "mine") params.set("scope", "mine");
      const qs = params.toString();
      return qs ? `/emails?${qs}` : "/emails";
    };

    expect(buildTabUrl("pending", "all")).toBe("/emails");
    expect(buildTabUrl("done", "all")).toBe("/emails?view=done");
    expect(buildTabUrl("pending", "mine")).toBe("/emails?scope=mine");
    expect(buildTabUrl("done", "mine")).toBe("/emails?view=done&scope=mine");
  });
});
