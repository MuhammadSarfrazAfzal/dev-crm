import { describe, expect, it } from "vitest";
import { recordsFromText } from "@/lib/import/text-records";
import { parseRecordBlocks } from "@/lib/import/record-blocks";
import { extractUpload } from "@/lib/import/extract";
import { inFileKeys, normalizeRow } from "@/lib/import/normalize";
import { applyMapping, suggestMapping } from "@/lib/import/columns";
import { isDirectoryHost } from "@/lib/import/directories";
import type { ExtractedText } from "@/lib/import/types";

const noOcr = async (_: Uint8Array, source: string): Promise<ExtractedText> => ({ source, text: "" });
const cells = (text: string) => recordsFromText(text).map((r) => r.cells);

describe("messy input → one business per row", () => {
  it("splits prose that mentions two shops", () => {
    const recs = recordsFromText("Spoke with Maria at Lakeside Cell Repair, call her at 512-555-0144 after 2pm. Also Downtown Phone Fix (737) 555-0145 owner Ken.");
    expect(recs).toHaveLength(2);
    expect(recs[0].cells).toMatchObject({ Company: "Lakeside Cell Repair", Phone: "512-555-0144" });
    expect(recs[1].cells).toMatchObject({ Company: "Downtown Phone Fix", Phone: "(737) 555-0145" });
  });

  it("reads a bullet list under a heading, keeping fax out of the phones", () => {
    const recs = cells(`Leads from Saturday:
• Lone Star Wireless – Austin, TX – 512-555-0150
• Hill Country Phone Repair, Round Rock TX, 512.555.0151, info@hcpr.example.com
  ask for Dana
• Capitol Cell Fix (512) 555-0152 / fax (512) 555-0153`);
    expect(recs).toHaveLength(3);
    expect(recs[0]).toMatchObject({ Company: "Lone Star Wireless", City: "Austin", State: "TX", Phone: "512-555-0150" });
    expect(recs[1]).toMatchObject({ Company: "Hill Country Phone Repair", Email: "info@hcpr.example.com" });
    expect(recs[2]).toMatchObject({ Company: "Capitol Cell Fix", Phone: "(512) 555-0152" });
    expect(recs[2].Notes).toContain("Fax: (512) 555-0153");
  });

  it("reads OCR text from a maps screenshot", () => {
    const recs = cells(`Q Search
METRO GADGET REPAIR
4.6 ★★★★★ (212)
Cell phone store · 1201 Main St
Open · Closes 8 PM
(214) 555-0160
metrogadget.example.com

FIXIT PHONE LAB
4.2 ★★★★☆ (58)
Electronics repair shop
(469) 555-0161`);
    expect(recs).toHaveLength(2);
    expect(recs[0]).toMatchObject({ Company: "METRO GADGET REPAIR", Phone: "(214) 555-0160", Website: "metrogadget.example.com" });
    expect(recs[1]).toMatchObject({ Company: "FIXIT PHONE LAB", Phone: "(469) 555-0161" });
  });

  it("reads a pasted email signature", () => {
    const recs = recordsFromText(`Thanks for your time today!

Best regards,
Jordan Patel
Owner, Bayou Mobile Solutions
2210 Canal St, New Orleans, LA 70112
Tel: (504) 555-0170 | Fax: (504) 555-0171
jordan@bayoumobile.example.com
www.bayoumobile.example.com`);
    expect(recs).toHaveLength(1);
    expect(recs[0].cells).toMatchObject({
      Company: "Bayou Mobile Solutions",
      Contact: "Jordan Patel",
      Phone: "(504) 555-0170",
      Email: "jordan@bayoumobile.example.com",
      Address: "2210 Canal St",
      City: "New Orleans",
      State: "LA",
      Zip: "70112",
    });
    expect(recs[0].issues).not.toContain("needs_split");
  });

  it("keeps labeled numbers together but flags unlabeled phones it can't attribute", () => {
    const sig = recordsFromText("Metro Wireless\nTel: 312-555-0181\nCell: 312-555-0182");
    expect(sig).toHaveLength(1);
    expect(sig[0].cells.Phone).toBe("312-555-0181; 312-555-0182");
    expect(sig[0].issues).not.toContain("needs_split");

    const mixed = recordsFromText("Metro Wireless and Quick Fix Phones\n312-555-0183\n713-555-0184");
    expect(mixed[0].issues).toContain("needs_split");
    expect(mixed[0].snippet).toContain("Quick Fix Phones");
  });

  it("marks guessed names as weak and keeps the original snippet", () => {
    const [r] = recordsFromText("sales@riverbend-phones.example.com");
    expect(r.cells.Company).toBe("Riverbend Phones");
    expect(r.issues).toContain("weak_name");
    expect(r.snippet).toBe("sales@riverbend-phones.example.com");
    const n = normalizeRow(applyMapping(r.cells, suggestMapping(Object.keys(r.cells))), { fromText: true, extraIssues: r.issues });
    expect(n.confidence).toBeLessThan(0.8);
  });
});

describe("directory layout (record blocks)", () => {
  const LAYOUT = `BUSINESS CALLING DIRECTORY

Publicly sourced | Not call-verified | 23 October 2026                1 / 2
Houston area
Contacts 001-003 | Towns and surrounding communities

001     uBreakiFix - Conroe                                       +1 (936) 703-1095

        Conroe, TX | 1403 N LOOP 336 W STE B2, Conroe, TX 77304

        Business website: ubreakifix.com [open source]

002     The Fix - Phone Repair, Tablet Repair And                 +1 (346) 819-8164
        Accessories
        Humble, TX | 20131 US-59 #1360, Humble TX 77338

        Public directory: local.yahoo.com [open source]

003     Quick Phone Clinic                                        +1 (713) 555-0101

        Houston, TX |

        Waze directory: waze.com [open source]


Publicly sourced | Not call-verified | 23 October 2026                2 / 2
Austin area
Contacts 004-005 | Towns and surrounding communities

004     uBreakiFix - Round Rock                                   +1 (512) 555-0102

        Round Rock, TX | 117 Louis Henna Blvd, Round Rock, TX 78664

        Business website: ubreakifix.com [open source]

005     The Fix - Phone Repair, Tablet Repair And                 +1 (512) 555-0103
        Accessories
        Austin, TX | 500 Congress Ave, Austin, TX 78701

        Public directory: local.yahoo.com [open source]
`;

  it("returns one row per entry with name wraps joined and headings as tags", () => {
    const { records, confidence } = parseRecordBlocks(LAYOUT);
    expect(confidence).toBeGreaterThanOrEqual(0.9);
    expect(records).toHaveLength(5);
    expect(records[0]).toEqual({
      "Record #": "001", Company: "uBreakiFix - Conroe", Phone: "+1 (936) 703-1095", Area: "Houston area",
      City: "Conroe", State: "TX", Address: "1403 N LOOP 336 W STE B2, Conroe, TX 77304", Zip: "77304",
      Website: "ubreakifix.com", Source: "Business website: ubreakifix.com",
    });
    expect(records[1].Company).toBe("The Fix - Phone Repair, Tablet Repair And Accessories");
    expect(records[1].Website).toBeUndefined();
    expect(records[1].Source).toBe("Public directory: local.yahoo.com");
    expect(records[2]).toMatchObject({ City: "Houston", Source: "Waze directory: waze.com" });
    expect(records[2].Address).toBeUndefined();
    expect(records.slice(3).every((r) => r.Area === "Austin area")).toBe(true);
    expect(records.some((r) => /area|Contacts|Publicly/.test(r.Company))).toBe(false);
  });

  it("puts emails listed in an entry into the Email column", () => {
    const text = `Dallas area

001     Metro Fix Dallas                                          +1 (214) 555-0110
        Dallas, TX | 1200 Elm St, Dallas, TX 75201
        Email: Owner@MetroFix.example.com
        Business website: metrofix.example.com [open source]

002     Deep Ellum Phones                                         +1 (214) 555-0111
        Dallas, TX | 2800 Main St, Dallas, TX 75226
        sales@deepellum.example.com
`;
    const { records } = parseRecordBlocks(text);
    expect(records.map((r) => r.Email)).toEqual(["Owner@MetroFix.example.com", "sales@deepellum.example.com"]);
    const mapping = suggestMapping([...new Set(records.flatMap((r) => Object.keys(r)))]);
    expect(mapping.Email).toBe("email");
    const rows = records.map((r) => normalizeRow(applyMapping(r, mapping), { structured: true }).row);
    expect(rows.map((r) => r.emails.map((e) => e.address))).toEqual([["owner@metrofix.example.com"], ["sales@deepellum.example.com"]]);
    expect(rows[0]).toMatchObject({ company: "Metro Fix Dallas", city: "Dallas", state: "TX", postal_code: "75201", area: "Dallas area" });
  });

  it("maps and normalizes without false duplicates for chains or shared directories", () => {
    const { records } = parseRecordBlocks(LAYOUT);
    const mapping = suggestMapping([...new Set(records.flatMap((r) => Object.keys(r)))]);
    expect(mapping).toMatchObject({ "Record #": "record_number", Company: "company", Phone: "phone", Area: "area", Source: "source", Website: "website", Zip: "postal_code" });
    const rows = records.map((r) => normalizeRow(applyMapping(r, mapping), { structured: true }));
    expect(rows.every((r) => r.row.phones.length === 1)).toBe(true);
    expect(rows[0].row).toMatchObject({ company: "uBreakiFix - Conroe", city: "Conroe", state: "TX", postal_code: "77304", area: "Houston area", record_number: "001", website_domain: "ubreakifix.com" });
    expect(rows[0].confidence).toBeGreaterThanOrEqual(0.9);
    const keys = rows.map((r) => inFileKeys(r.row));
    const seen = new Set<string>();
    let dupes = 0;
    for (const k of keys) {
      if (k.some((x) => seen.has(x))) dupes++;
      k.forEach((x) => seen.add(x));
    }
    expect(dupes).toBe(0);
  });

  it("extracts the same layout from a real PDF with positioned text", async () => {
    const pdf = buildPdf([
      [
        { x: 36, y: 800, size: 20, text: "Houston area" },
        { x: 36, y: 776, size: 10, text: "Contacts 001-002 | Towns and surrounding communities" },
        { x: 36, y: 730, size: 9, text: "001" },
        { x: 66, y: 730, size: 10, text: "uBreakiFix - Conroe" },
        { x: 416, y: 730, size: 11, text: "+1 (936) 703-1095" },
        { x: 66, y: 705, size: 8, text: "Conroe, TX | 1403 N LOOP 336 W STE B2, Conroe, TX 77304" },
        { x: 66, y: 683, size: 8, text: "Business website: ubreakifix.com [open source]" },
        { x: 36, y: 660, size: 9, text: "002" },
        { x: 66, y: 660, size: 10, text: "The Fix - Phone Repair, Tablet Repair And" },
        { x: 416, y: 660, size: 11, text: "+1 (346) 819-8164" },
        { x: 66, y: 648, size: 10, text: "Accessories" },
        { x: 66, y: 630, size: 8, text: "Humble, TX | 20131 US-59 #1360, Humble TX 77338" },
        { x: 66, y: 608, size: 8, text: "Public directory: local.yahoo.com [open source]" },
        { x: 36, y: 40, size: 7, text: "Publicly sourced | Not call-verified" },
        { x: 500, y: 40, size: 7, text: "1 / 2" },
      ],
      [
        { x: 36, y: 800, size: 20, text: "Austin area" },
        { x: 36, y: 730, size: 9, text: "003" },
        { x: 66, y: 730, size: 10, text: "Hill Country Phone Repair" },
        { x: 416, y: 730, size: 11, text: "+1 (512) 555-0151" },
        { x: 66, y: 705, size: 8, text: "Round Rock, TX | 117 Louis Henna Blvd, Round Rock, TX 78664" },
        { x: 66, y: 683, size: 8, text: "Waze directory: waze.com [open source]" },
      ],
    ]);
    const r = await extractUpload({ name: "directory.pdf", kind: "pdf", data: pdf }, { ocr: noOcr });
    expect(r.texts).toHaveLength(1);
    const { records, confidence } = parseRecordBlocks(r.texts[0].text);
    expect(confidence).toBeGreaterThanOrEqual(0.9);
    expect(records.map((x) => [x["Record #"], x.Company, x.City, x.Area])).toEqual([
      ["001", "uBreakiFix - Conroe", "Conroe", "Houston area"],
      ["002", "The Fix - Phone Repair, Tablet Repair And Accessories", "Humble", "Houston area"],
      ["003", "Hill Country Phone Repair", "Round Rock", "Austin area"],
    ]);
  });

  it("falls back to the free-text parser when there is no block structure", () => {
    expect(parseRecordBlocks("Metro Wireless 312-555-0101\nsome notes").confidence).toBe(0);
  });

  it("knows listing sites from business sites", () => {
    expect(["waze.com", "local.yahoo.com", "www.yelp.com/biz/x", "cylex.us.com"].every(isDirectoryHost)).toBe(true);
    expect(["ubreakifix.com", "metro.example.com"].some(isDirectoryHost)).toBe(false);
    const n = normalizeRow({ company: "A", phone: "312-555-0101", website: "https://www.yelp.com/biz/a" });
    expect(n.row.website).toBeNull();
    expect(n.row.source).toBe("yelp.com");
  });
});

type Run = { x: number; y: number; size: number; text: string };

/** A multi-page PDF with text runs at fixed positions, like a generated directory. */
function buildPdf(pages: Run[][]): Uint8Array {
  const objects: string[] = [];
  const add = (o: string) => objects.push(o) && objects.length;
  const catalog = add("");
  const pagesObj = add("");
  const font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const kids: number[] = [];
  for (const runs of pages) {
    const content = runs.map((r) => `BT /F1 ${r.size} Tf ${r.x} ${r.y} Td (${r.text.replace(/[()\\]/g, "\\$&")}) Tj ET`).join("\n");
    const c = add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 612 842] /Contents ${c} 0 R /Resources << /Font << /F1 ${font} 0 R >> >> >>`));
  }
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
  objects[pagesObj - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}

describe("messy notes with a bullet list followed by a free line", () => {
  const text = `Leads from Saturday (test data):
• Sigma Test Phones – Dallas, TX – 214-555-0194 – ask for Dana, dana@sigma-test.example.com
• Kappa Test Mobile Repair, 400 Fake Rd, Plano TX 75074, 972.555.0195, info@kappa-test.example.com
Spoke with Lee at Theta Test Cellular (469) 555-0196 after 2pm, wants price list`;

  it("gives each business its own row with every field in its column", () => {
    const recs = recordsFromText(text).map((r) => r.cells);
    expect(recs).toHaveLength(3);
    expect(recs[0]).toMatchObject({ Company: "Sigma Test Phones", Contact: "Dana", Phone: "214-555-0194", Email: "dana@sigma-test.example.com", City: "Dallas", State: "TX" });
    expect(recs[1]).toMatchObject({ Company: "Kappa Test Mobile Repair", Address: "400 Fake Rd", City: "Plano", State: "TX", Zip: "75074", Email: "info@kappa-test.example.com" });
    expect(recs[2]).toMatchObject({ Company: "Theta Test Cellular", Contact: "Lee", Phone: "(469) 555-0196" });
  });
});
