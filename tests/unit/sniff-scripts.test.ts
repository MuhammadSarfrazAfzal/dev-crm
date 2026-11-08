import { describe, expect, it } from "vitest";
import { safeFilename, sniff, validateFile } from "@/lib/import/sniff";
import { fillScript } from "@/components/lead/ScriptsPanel";

const enc = (s: string) => new TextEncoder().encode(s);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const ZIP = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);

describe("upload validation", () => {
  it("accepts files whose bytes match the extension", () => {
    expect(validateFile("leads.csv", enc("name,phone\nA,1"), { maxBytes: 1000 })).toMatchObject({ ok: true, kind: "csv" });
    expect(validateFile("card.PNG", PNG, { maxBytes: 1000 })).toMatchObject({ ok: true, kind: "png" });
    expect(validateFile("list.xlsx", ZIP, { maxBytes: 1000 })).toMatchObject({ ok: true, kind: "xlsx" });
    expect(validateFile("doc.pdf", enc("%PDF-1.7\n"), { maxBytes: 1000 })).toMatchObject({ ok: true, kind: "pdf" });
  });
  it("rejects mismatches, unknown types, empty and oversized files", () => {
    expect(validateFile("evil.png", enc("<script>alert(1)</script>"), { maxBytes: 1000 }).ok).toBe(false);
    expect(validateFile("leads.csv", PNG, { maxBytes: 1000 }).ok).toBe(false);
    expect(validateFile("run.exe", enc("MZ"), { maxBytes: 1000 }).ok).toBe(false);
    expect(validateFile("page.html", enc("<html>"), { maxBytes: 1000 }).ok).toBe(false);
    expect(validateFile("noext", enc("hello"), { maxBytes: 1000 }).ok).toBe(false);
    expect(validateFile("a.csv", new Uint8Array(), { maxBytes: 1000 }).ok).toBe(false);
    expect(validateFile("a.csv", enc("x".repeat(2000)), { maxBytes: 1000 }).ok).toBe(false);
  });
  it("treats binary garbage as non-text", () => {
    expect(sniff(new Uint8Array([0, 1, 2, 3]))).toBeNull();
  });
  it("cleans filenames", () => {
    expect(safeFilename("../../etc/passwd")).toBe("passwd");
    expect(safeFilename("C:\\Users\\me\\Leads Q4.xlsx")).toBe("Leads Q4.xlsx");
    expect(safeFilename("a\"b<c>.csv")).toBe("a_b_c_.csv");
    expect(safeFilename("...")).toBe("file");
  });
});

describe("script placeholders", () => {
  it("fills known values and leaves unknown ones visible", () => {
    expect(fillScript("Hi {{contact_name}}, this is {{ rep_name }} at {{rep_phone}}", { contact_name: "Casey", rep_name: "Sam" })).toBe(
      "Hi Casey, this is Sam at {{rep_phone}}",
    );
  });
});
