import { afterAll, describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { strToU8, zipSync } from "fflate";
import { createCanvas } from "@napi-rs/canvas";
import { applyMapping, suggestMapping } from "@/lib/import/columns";
import { recordsFromText } from "@/lib/import/text-records";
import { inFileKeys, normalizeRow } from "@/lib/import/normalize";
import { extractUpload } from "@/lib/import/extract";
import { ocrImage, shutdownOcr } from "@/lib/import/ocr";
import { inspectZip } from "@/lib/import/zip-safety";
import type { ExtractedText } from "@/lib/import/types";

const enc = (s: string) => new TextEncoder().encode(s);
const fakeOcr = async (_img: Uint8Array, source: string): Promise<ExtractedText> => ({ source, text: "OCR Shop\n(312) 555-0111", ocrConfidence: 0.9 });

afterAll(() => shutdownOcr());

describe("column matching", () => {
  it("maps common headers", () => {
    expect(suggestMapping(["Business Name", "Owner", "Phone 1", "Cell", "E-mail", "Web Site", "Street Address", "City", "ST", "Zip Code", "Comments"])).toEqual({
      "Business Name": "company", Owner: "contact_name", "Phone 1": "phone", Cell: "mobile", "E-mail": "email", "Web Site": "website",
      "Street Address": "address", City: "city", ST: "state", "Zip Code": "postal_code", Comments: "notes",
    });
  });
  it("treats a lone Name column as the company and a second name column as the contact", () => {
    expect(suggestMapping(["Name", "Phone"]).Name).toBe("company");
    expect(suggestMapping(["Company", "Name", "Phone"])).toMatchObject({ Company: "company", Name: "contact_name" });
    expect(suggestMapping(["Store", "Shop Name"])).toMatchObject({ Store: "company", "Shop Name": "contact_name" });
  });
  it("collects multiple phone columns", () => {
    const m = suggestMapping(["Company", "Phone 1", "Phone 2"]);
    expect(applyMapping({ Company: "A", "Phone 1": "312-555-0101", "Phone 2": "312-555-0102" }, m)).toEqual({ company: "A", phone: "312-555-0101; 312-555-0102" });
  });
});

describe("free-text records", () => {
  it("reads one-line-per-shop lists", () => {
    const recs = recordsFromText(`Metro Wireless - Chicago, IL - (312) 555-0101 - info@metro.example.com
Quick Fix Phones | Houston, TX | 713.555.0102
Prime Cellular, 602-555-0103, owner@prime.example.com`);
    expect(recs).toHaveLength(3);
    expect(recs[0].cells).toMatchObject({ Company: "Metro Wireless", City: "Chicago", State: "IL", Phone: "(312) 555-0101", Email: "info@metro.example.com" });
    expect(recs[1].cells).toMatchObject({ Company: "Quick Fix Phones", Phone: "713.555.0102" });
    expect(recs[2].cells.Company).toBe("Prime Cellular");
  });
  it("reads blank-line separated blocks with labels", () => {
    const recs = recordsFromText(`Golden Phone Repair
123 Main St, Denver, CO 80202
Contact: Jamie Kim
Phone: 303-555-0104
www.golden.example.com

Company: Harbor Mobile
Mobile: (206) 555-0105 ext. 3
Email: sales@harbor.example.com`);
    expect(recs).toHaveLength(2);
    expect(recs[0].cells).toMatchObject({ Company: "Golden Phone Repair", Contact: "Jamie Kim", Address: "123 Main St", City: "Denver", State: "CO", Zip: "80202", Website: "www.golden.example.com" });
    expect(recs[1].cells).toMatchObject({ Company: "Harbor Mobile", Email: "sales@harbor.example.com" });
    expect(recs[1].cells.Phone).toContain("555-0105");
  });
  it("splits OCR output with no blank lines between businesses", () => {
    const recs = recordsFromText("Desert Phone Clinic\nTucson, AZ 85701\n(520) 555-0131\nCanyon Cellular\nFlagstaff, AZ\n928-555-0132");
    expect(recs.map((r) => [r.cells.Company, r.cells.City, r.cells.Phone])).toEqual([
      ["Desert Phone Clinic", "Tucson", "(520) 555-0131"],
      ["Canyon Cellular", "Flagstaff", "928-555-0132"],
    ]);
  });
  it("finds unformatted E.164 numbers", () => {
    expect(recordsFromText("Harbor Mobile +12065550105")[0].cells).toMatchObject({ Company: "Harbor Mobile", Phone: "+12065550105" });
  });
  it("ignores text with nothing useful", () => {
    expect(recordsFromText("\n\n   \n")).toEqual([]);
  });
});

describe("normalizeRow", () => {
  it("normalizes a clean row", () => {
    const { row, issues, confidence } = normalizeRow({ company: " Metro  Wireless ", phone: "(312) 555-0101", email: "Info@Metro.example.com", state: "illinois" });
    expect(row).toMatchObject({ company: "Metro Wireless", state: "IL", time_zone: "America/Chicago" });
    expect(row.phones[0].e164).toBe("+13125550101");
    expect(row.emails[0]).toEqual({ address: "info@metro.example.com", label: "general" });
    expect(issues).toEqual(["role_email_only"].filter(() => false));
    expect(confidence).toBe(1);
  });
  it("flags problems and lowers confidence", () => {
    const r = normalizeRow({ company: "", phone: "555-01", email: "nope" });
    expect(r.issues).toEqual(expect.arrayContaining(["invalid_phone", "invalid_email", "missing_company", "no_contact_method"]));
    expect(r.confidence).toBeLessThan(0.3);
  });
  it("infers the state from the area code", () => {
    const r = normalizeRow({ company: "A", phone: "305-555-0100" });
    expect(r.row.state).toBe("FL");
    expect(r.issues).toContain("state_from_area_code");
  });
  it("marks OCR and free text rows for review", () => {
    const r = normalizeRow({ company: "A", phone: "305-555-0100", state: "FL" }, { fromText: true, ocrConfidence: 0.5 });
    expect(r.issues).toContain("ocr_low_confidence");
    expect(r.confidence).toBeLessThan(0.5);
  });
  it("builds duplicate keys", () => {
    const { row } = normalizeRow({ company: "Metro Wireless LLC", phone: "312-555-0101", website: "https://www.metro.example.com/x", state: "IL" });
    expect(inFileKeys(row)).toEqual(["phone:+13125550101", "name:metro wireless||IL|"]);
    const a = normalizeRow({ company: "Cell Phone Repair", phone: "713-555-0101", city: "Houston", state: "TX", address: "100 Main St" }).row;
    const b = normalizeRow({ company: "Cell Phone Repair", phone: "713-555-0102", city: "Houston", state: "TX", address: "2500 Westheimer Rd" }).row;
    const c = normalizeRow({ company: "Cell Phone Repair", phone: "713-555-0103", city: "Houston", state: "TX", address: "100 Main Street, Suite 2" }).row;
    expect(inFileKeys(a)[1]).not.toBe(inFileKeys(b)[1]); // two locations of a chain
    expect(inFileKeys(a)[1]).toBe(inFileKeys(c)[1]); // the same shop listed twice
    expect(normalizeRow({ company: "A", phone: "713-555-0101", address: "Street address not captured; see source." }).row.address).toBeNull();
  });
});

describe("extractors", () => {
  it("parses CSV with a BOM and quoted commas", async () => {
    const r = await extractUpload({ name: "a.csv", kind: "csv", data: enc('﻿Company,Phone\n"Joe\'s Phones, LLC",312-555-0101\n') }, { ocr: fakeOcr });
    expect(r.tables[0].headers).toEqual(["Company", "Phone"]);
    expect(r.tables[0].rows).toEqual([["Joe's Phones, LLC", "312-555-0101"]]);
  });

  it("treats tab-separated .txt as a table and prose as text", async () => {
    const t = await extractUpload({ name: "a.txt", kind: "txt", data: enc("Company\tPhone\tCity\nA\t312-555-0101\tChicago\nB\t312-555-0102\tChicago") }, { ocr: fakeOcr });
    expect(t.tables).toHaveLength(1);
    const p = await extractUpload({ name: "b.txt", kind: "txt", data: enc("Call Metro Wireless at 312-555-0101") }, { ocr: fakeOcr });
    expect(p.texts[0].text).toContain("Metro");
  });

  it("reads every sheet of an XLSX and ignores formulas' code", async () => {
    const wb = new ExcelJS.Workbook();
    const s1 = wb.addWorksheet("Chicago");
    s1.addRow(["Company", "Phone"]);
    s1.addRow(["Metro Wireless", "312-555-0101"]);
    s1.addRow([{ formula: "1+1", result: 2 }, "x"]);
    const s2 = wb.addWorksheet("Houston");
    s2.addRow(["Shop", "Tel"]);
    s2.addRow(["Quick Fix", "713-555-0102"]);
    const data = new Uint8Array(await wb.xlsx.writeBuffer());
    const r = await extractUpload({ name: "list.xlsx", kind: "xlsx", data }, { ocr: fakeOcr });
    expect(r.tables.map((t) => t.source)).toEqual(["list.xlsx › Chicago", "list.xlsx › Houston"]);
    expect(r.tables[0].rows).toEqual([["Metro Wireless", "312-555-0101"], ["2", "x"]]);
  });

  it("reads tables and text from DOCX", async () => {
    const r = await extractUpload({ name: "list.docx", kind: "docx", data: minimalDocx() }, { ocr: fakeOcr });
    expect(r.tables[0]).toMatchObject({ headers: ["Company", "Phone"], rows: [["Metro &amp; Co".replace("&amp;", "&"), "312-555-0101"]] });
    expect(r.texts[0].text).toContain("Harbor Mobile");
  });

  it("reads the text layer of a PDF", async () => {
    const r = await extractUpload({ name: "list.pdf", kind: "pdf", data: minimalPdf("Golden Phone Repair 303-555-0104 Denver, CO") }, { ocr: fakeOcr });
    expect(r.texts[0].text).toContain("Golden Phone Repair");
    expect(r.parsers).toEqual(["unpdf-layout"]);
  });

  it("unpacks a ZIP, skips unsafe and nested entries", async () => {
    const zip = zipSync({
      "leads.csv": strToU8("Company,Phone\nA,312-555-0101\n"),
      "__MACOSX/._leads.csv": strToU8("junk"),
      "../../escape.csv": strToU8("Company,Phone\nB,312-555-0102\n"),
      "inner.zip": zipSync({ "x.csv": strToU8("a,b\n1,2") }),
      "virus.exe": strToU8("MZ..."),
      "fake.png": strToU8("not a png"),
    });
    const r = await extractUpload({ name: "batch.zip", kind: "zip", data: zip }, { ocr: fakeOcr });
    expect(r.tables.map((t) => t.source).sort()).toEqual(["batch.zip › escape.csv", "batch.zip › leads.csv"]);
    expect(r.notes.join("\n")).toMatch(/inner\.zip: nested archive skipped/);
    expect(r.notes.join("\n")).toMatch(/virus\.exe: skipped/);
    expect(r.notes.join("\n")).toMatch(/fake\.png: skipped/);
  });

  it("refuses zip bombs before inflating them", () => {
    const bomb = zipSync({ "zeros.csv": new Uint8Array(30 * 1024 * 1024) }, { level: 9 });
    expect(bomb.length).toBeLessThan(200_000);
    const check = inspectZip(bomb);
    expect(check.ok).toBe(false);
  });
});

describe("local OCR", () => {
  it("reads text from a generated image without network access", async () => {
    const canvas = createCanvas(900, 200);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, 900, 200);
    ctx.fillStyle = "#000";
    ctx.font = "48px sans-serif";
    ctx.fillText("Metro Wireless", 30, 80);
    ctx.fillText("312-555-0101", 30, 160);
    const png = new Uint8Array(canvas.toBuffer("image/png"));
    const r = await ocrImage(png, "card.png");
    expect(r.text).toMatch(/Metro Wireless/);
    expect(r.text.replace(/\s/g, "")).toMatch(/312-555-0101/);
    expect(r.ocrConfidence).toBeGreaterThan(0.6);
  }, 60_000);
});

function minimalDocx(): Uint8Array {
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
<w:p><w:r><w:t>Leads from the trade show</w:t></w:r></w:p>
<w:tbl>
<w:tr><w:tc><w:p><w:r><w:t>Company</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Phone</w:t></w:r></w:p></w:tc></w:tr>
<w:tr><w:tc><w:p><w:r><w:t>Metro &amp; Co</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>312-555-0101</w:t></w:r></w:p></w:tc></w:tr>
</w:tbl>
<w:p><w:r><w:t>Also call Harbor Mobile at 206-555-0105.</w:t></w:r></w:p>
</w:body></w:document>`;
  return zipSync({
    "[Content_Types].xml": strToU8(`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`),
    "_rels/.rels": strToU8(`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`),
    "word/document.xml": strToU8(doc),
  });
}

/** A one-page PDF with a text layer, assembled by hand with correct xref offsets. */
export function minimalPdf(text: string): Uint8Array {
  const content = `BT /F1 14 Tf 40 760 Td (${text.replace(/[()\\]/g, "\\$&")}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return enc(out);
}
