import { describe, expect, it } from "vitest";
import { formatPhone, parsePhone, splitPhones } from "@/lib/phone";
import { normalizeWebsite, parseEmail, splitEmails, websiteDomain } from "@/lib/email";
import { normalizeState, stateForAreaCode, timeZoneForState } from "@/lib/us";

describe("parsePhone", () => {
  it.each([
    ["(312) 555-0142", "+13125550142"],
    ["312.555.0142", "+13125550142"],
    ["1-312-555-0142", "+13125550142"],
    ["+1 312 555 0142", "+13125550142"],
    ["tel:+13125550142", "+13125550142"],
  ])("normalizes %s", (raw, e164) => {
    const p = parsePhone(raw);
    expect(p.valid).toBe(true);
    expect(p.e164).toBe(e164);
    expect(p.state).toBe("IL");
  });

  it("keeps extensions", () => {
    expect(parsePhone("312-555-0142 ext. 12")).toMatchObject({ e164: "+13125550142", ext: "12" });
    expect(parsePhone("312-555-0142 x9")).toMatchObject({ e164: "+13125550142", ext: "9" });
  });

  it("rejects bad numbers with a reason", () => {
    expect(parsePhone("").reason).toBe("empty");
    expect(parsePhone("555-0142").reason).toBe("too_short");
    expect(parsePhone("123-555-0142").reason).toBe("invalid_area_code");
    expect(parsePhone("312-055-0142").reason).toBe("invalid_exchange");
    expect(parsePhone("411-555-0142").reason).toBe("invalid_area_code");
    expect(parsePhone("1-800-FLOWERS").reason).toBe("letters");
  });

  it("flags toll-free and international numbers", () => {
    expect(parsePhone("800-555-0100")).toMatchObject({ valid: true, tollFree: true, state: null });
    expect(parsePhone("+44 20 7946 0958")).toMatchObject({ valid: true, international: true, e164: "+442079460958" });
  });

  it("formats and splits", () => {
    expect(formatPhone("+13125550142", "4")).toBe("(312) 555-0142 ext. 4");
    expect(splitPhones("312-555-0101 / 312-555-0102; mobile: 773.555.0199")).toEqual([
      "312-555-0101", "312-555-0102", "773.555.0199",
    ]);
  });
});

describe("parseEmail", () => {
  it("accepts and lower-cases valid addresses", () => {
    expect(parseEmail(" Owner@Example.com ")).toMatchObject({ valid: true, address: "owner@example.com", role: false });
    expect(parseEmail("mailto:info@shop.example.org")).toMatchObject({ valid: true, role: true });
  });
  it.each(["owner@", "@example.com", "owner@example", "owner@@example.com", "a..b@example.com", "owner example.com"])(
    "rejects %s",
    (raw) => expect(parseEmail(raw).valid).toBe(false),
  );
  it("splits lists", () => {
    expect(splitEmails("a@example.com; b@example.com, nope")).toEqual(["a@example.com", "b@example.com"]);
  });
});

describe("websites and states", () => {
  it("extracts domains and refuses unsafe schemes", () => {
    expect(websiteDomain("https://www.Example.com/shop")).toBe("example.com");
    expect(websiteDomain("example.com")).toBe("example.com");
    expect(websiteDomain("not a site")).toBeNull();
    expect(normalizeWebsite("example.com/contact")).toBe("https://example.com/contact");
    expect(normalizeWebsite("javascript:alert(1)")).toBeNull();
    expect(normalizeWebsite("ftp://example.com")).toBeNull();
  });
  it("normalizes states and maps zones", () => {
    expect(normalizeState("texas")).toBe("TX");
    expect(normalizeState("N.Y.")).toBe("NY");
    expect(normalizeState("Narnia")).toBeNull();
    expect(timeZoneForState("AZ")).toBe("America/Phoenix");
    expect(stateForAreaCode("305")).toBe("FL");
    expect(stateForAreaCode("800")).toBeNull();
  });
});
