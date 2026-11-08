/**
 * Messy, realistic import samples with the rows a careful person would type from them.
 * Every expected value appears in the sample itself; nothing is inferred. Phone numbers
 * use the 555 range and domains are example.com-style, so nothing here is a real shop.
 */
import ExcelJS from "exceljs";
import { strToU8, zipSync } from "fflate";

export type Expected = {
  company: string;
  contact?: string;
  phones?: string[];
  emails?: string[];
  website?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
};

export type Sample =
  | { name: string; kind: "paste"; text: string; expected: Expected[] }
  | { name: string; kind: "txt" | "csv" | "xlsx" | "docx" | "pdf"; file: () => Promise<Uint8Array> | Uint8Array; expected: Expected[] };

const enc = (s: string) => new TextEncoder().encode(s);

export const SAMPLES: Sample[] = [
  {
    name: "one-line blob, several shops separated by semicolons",
    kind: "paste",
    text: `Metro Wireless Repair 312-555-0101 metro@metrowireless.example.com 1200 W Madison St Chicago IL 60607 ask for Tony; Lakeview Phone Fix (773) 555-0102 lakeviewfix.example.com 3150 N Broadway, Chicago, IL 60657; Southside Cellular 773.555.0103 info@southsidecell.example.com`,
    expected: [
      { company: "Metro Wireless Repair", contact: "Tony", phones: ["312-555-0101"], emails: ["metro@metrowireless.example.com"], address: "1200 W Madison St", city: "Chicago", state: "IL", zip: "60607" },
      { company: "Lakeview Phone Fix", phones: ["(773) 555-0102"], website: "lakeviewfix.example.com", address: "3150 N Broadway", city: "Chicago", state: "IL", zip: "60657" },
      { company: "Southside Cellular", phones: ["773.555.0103"], emails: ["info@southsidecell.example.com"] },
    ],
  },
  {
    name: "fields in random order, blank line between shops",
    kind: "paste",
    text: `orders@gadgetdepot.example.com
(214) 555-0110
Gadget Depot Wireless
4420 Ross Ave, Dallas TX 75204

2145550111
Uptown Cell Clinic
2700 McKinney Ave Dallas, TX 75204
Owner: Priya Shah
priya@uptowncell.example.com

www.deepellumphones.example.com
Deep Ellum Phones & Repair
2808 Main St Dallas TX 75226
+1 214 555 0112`,
    expected: [
      { company: "Gadget Depot Wireless", phones: ["(214) 555-0110"], emails: ["orders@gadgetdepot.example.com"], address: "4420 Ross Ave", city: "Dallas", state: "TX", zip: "75204" },
      { company: "Uptown Cell Clinic", contact: "Priya Shah", phones: ["2145550111"], emails: ["priya@uptowncell.example.com"], address: "2700 McKinney Ave", city: "Dallas", state: "TX", zip: "75204" },
      { company: "Deep Ellum Phones & Repair", phones: ["+1 214 555 0112"], website: "deepellumphones.example.com", address: "2808 Main St", city: "Dallas", state: "TX", zip: "75226" },
    ],
  },
  {
    name: "records split over lines with no blank lines between them",
    kind: "paste",
    text: `Bayou City Wireless
6100 Westheimer Rd
Houston, TX 77057
713-555-0120
bayoucity@wireless.example.com
Galleria Phone Doctor
5085 Westheimer Rd Suite 2600
Houston, TX 77056
713-555-0121
www.galleriaphonedoc.example.com
Heights Mobile Fix
1111 Studewood St
Houston, TX 77008
(832) 555-0122
Contact: Marcus Lee`,
    expected: [
      { company: "Bayou City Wireless", phones: ["713-555-0120"], emails: ["bayoucity@wireless.example.com"], address: "6100 Westheimer Rd", city: "Houston", state: "TX", zip: "77057" },
      { company: "Galleria Phone Doctor", phones: ["713-555-0121"], website: "galleriaphonedoc.example.com", address: "5085 Westheimer Rd Suite 2600", city: "Houston", state: "TX", zip: "77056" },
      { company: "Heights Mobile Fix", contact: "Marcus Lee", phones: ["(832) 555-0122"], address: "1111 Studewood St", city: "Houston", state: "TX", zip: "77008" },
    ],
  },
  {
    name: "copy-pasted map listings",
    kind: "paste",
    text: `Fone Doctors Austin
4.6(212)
Cell phone store · 2301 S Lamar Blvd
Open ⋅ Closes 7 PM
(512) 555-0130
Website
Directions

iFix Wireless South
4.8(97)
Mobile phone repair shop · 9600 S I-35 Frontage Rd
Closed ⋅ Opens 10 AM
(512) 555-0131
Website
Directions

Cellular Solutions ATX
4.2(31)
Electronics store · 5400 Brodie Ln
(512) 555-0132`,
    expected: [
      { company: "Fone Doctors Austin", phones: ["(512) 555-0130"], address: "2301 S Lamar Blvd" },
      { company: "iFix Wireless South", phones: ["(512) 555-0131"], address: "9600 S I-35 Frontage Rd" },
      { company: "Cellular Solutions ATX", phones: ["(512) 555-0132"], address: "5400 Brodie Ln" },
    ],
  },
  {
    name: "inconsistent separators, one shop per line",
    kind: "paste",
    text: `Phoenix Phone Repair | 602-555-0140 | phx@phonerepair.example.com | Phoenix, AZ
Tempe Tech Fix - (480) 555-0141 - Tempe, AZ
Mesa Cell Outlet, 480.555.0142, mesacell@outlet.example.com
Scottsdale Smart Repair	480-555-0143	Scottsdale, AZ 85251
Glendale Gadgets / 623 555 0144 / glendalegadgets.example.com`,
    expected: [
      { company: "Phoenix Phone Repair", phones: ["602-555-0140"], emails: ["phx@phonerepair.example.com"], city: "Phoenix", state: "AZ" },
      { company: "Tempe Tech Fix", phones: ["(480) 555-0141"], city: "Tempe", state: "AZ" },
      { company: "Mesa Cell Outlet", phones: ["480.555.0142"], emails: ["mesacell@outlet.example.com"] },
      { company: "Scottsdale Smart Repair", phones: ["480-555-0143"], city: "Scottsdale", state: "AZ", zip: "85251" },
      { company: "Glendale Gadgets", phones: ["623 555 0144"], website: "glendalegadgets.example.com" },
    ],
  },
  {
    name: "several phones and emails per shop",
    kind: "paste",
    text: `Cell Hub Houston (713) 555-0150 / 713.555.0151 cell, sales@cellhub.example.com, owner Ray Ortiz ray@cellhub.example.com, 9800 Bellaire Blvd, Houston, TX 77036

Wireless World — store 832-555-0152, mobile 832-555-0153 — ww@wirelessworld.example.com — manager: Lina Park — 12500 Bissonnet St, Houston TX 77099`,
    expected: [
      { company: "Cell Hub Houston", contact: "Ray Ortiz", phones: ["(713) 555-0150", "713.555.0151"], emails: ["sales@cellhub.example.com", "ray@cellhub.example.com"], address: "9800 Bellaire Blvd", city: "Houston", state: "TX", zip: "77036" },
      { company: "Wireless World", contact: "Lina Park", phones: ["832-555-0152", "832-555-0153"], emails: ["ww@wirelessworld.example.com"], address: "12500 Bissonnet St", city: "Houston", state: "TX", zip: "77099" },
    ],
  },
  {
    name: "odd labels and abbreviations",
    kind: "paste",
    text: `Business Name - Atlanta Phone Medic
Ph# 404 555 0160
E: medic@atlphone.example.com
Loc: 2900 Peachtree Rd NE Atlanta GA 30305
Owner Mike Chen

Biz: Buckhead Wireless Repair
Tel. No. 404-555-0161
Mail - buckhead@wirelessrepair.example.com
Addr: 3330 Piedmont Rd, Atlanta, Georgia 30305
Contact Person: Angela Brooks`,
    expected: [
      { company: "Atlanta Phone Medic", contact: "Mike Chen", phones: ["404 555 0160"], emails: ["medic@atlphone.example.com"], address: "2900 Peachtree Rd NE", city: "Atlanta", state: "GA", zip: "30305" },
      { company: "Buckhead Wireless Repair", contact: "Angela Brooks", phones: ["404-555-0161"], emails: ["buckhead@wirelessrepair.example.com"], address: "3330 Piedmont Rd", city: "Atlanta", state: "GA", zip: "30305" },
    ],
  },
  {
    name: "call notes written as sentences",
    kind: "paste",
    text: `Called Pixel Fix in Garland today, number is 972-555-0170, guy named Carlos said email him at carlos@pixelfix.example.com. Their shop is at 3301 N Garland Ave, Garland, TX 75040.

Also spoke to Jenny Tran from Mobile Mania Plano, she wants the price list sent to jenny@mobilemania.example.com, store phone 469-555-0171.`,
    expected: [
      { company: "Pixel Fix", contact: "Carlos", phones: ["972-555-0170"], emails: ["carlos@pixelfix.example.com"], address: "3301 N Garland Ave", city: "Garland", state: "TX", zip: "75040" },
      { company: "Mobile Mania Plano", contact: "Jenny Tran", phones: ["469-555-0171"], emails: ["jenny@mobilemania.example.com"] },
    ],
  },
  {
    name: "all caps, no separators",
    kind: "paste",
    text: `QUICK FIX CELLULAR 2145550180 QUICKFIX@CELLULAR.EXAMPLE.COM DALLAS TX 75201
SUPER CELL REPAIR 4695550181 IRVING TX 75061
TOP NOTCH WIRELESS 9725550182 TOPNOTCHWIRELESS.EXAMPLE.COM`,
    expected: [
      { company: "QUICK FIX CELLULAR", phones: ["2145550180"], emails: ["quickfix@cellular.example.com"], city: "DALLAS", state: "TX", zip: "75201" },
      { company: "SUPER CELL REPAIR", phones: ["4695550181"], city: "IRVING", state: "TX", zip: "75061" },
      { company: "TOP NOTCH WIRELESS", phones: ["9725550182"], website: "topnotchwireless.example.com" },
    ],
  },
  {
    name: "text file with numbered entries and wrapped addresses",
    kind: "txt",
    file: () =>
      enc(`Leads - San Antonio run

1) Alamo Cell Repair
   address: 210 W Commerce St,
   San Antonio, TX 78205
   phone (210) 555-0190  /  email alamo@cellrepair.example.com
2) Riverwalk Wireless
   (210) 555-0191
   500 E Houston St San Antonio TX 78205
   web: riverwalkwireless.example.com
3) Stone Oak Phone Lab -- 210 555 0192 -- stoneoak@phonelab.example.com -- ask for Diego
`),
    expected: [
      { company: "Alamo Cell Repair", phones: ["(210) 555-0190"], emails: ["alamo@cellrepair.example.com"], address: "210 W Commerce St", city: "San Antonio", state: "TX", zip: "78205" },
      { company: "Riverwalk Wireless", phones: ["(210) 555-0191"], website: "riverwalkwireless.example.com", address: "500 E Houston St", city: "San Antonio", state: "TX", zip: "78205" },
      { company: "Stone Oak Phone Lab", contact: "Diego", phones: ["210 555 0192"], emails: ["stoneoak@phonelab.example.com"] },
    ],
  },
  {
    name: "CSV with odd headers and combined cells",
    kind: "csv",
    file: () =>
      enc(`Store,Tel #,E-mail Addr,Location,Person in charge
"Orlando Phone Pros","407-555-0200","pros@orlandophone.example.com","5200 International Dr, Orlando, FL 32819","Sam Rivera"
"Kissimmee Kell Fix","(407) 555-0201 / 407-555-0202","","1500 W Vine St, Kissimmee, FL 34741",""
"Winter Park Wireless","407.555.0203","wpw@wireless.example.com; owner@wpw.example.com","400 S Park Ave, Winter Park, FL 32789","Kim Lee"
`),
    expected: [
      { company: "Orlando Phone Pros", contact: "Sam Rivera", phones: ["407-555-0200"], emails: ["pros@orlandophone.example.com"], address: "5200 International Dr", city: "Orlando", state: "FL", zip: "32819" },
      { company: "Kissimmee Kell Fix", phones: ["(407) 555-0201", "407-555-0202"], address: "1500 W Vine St", city: "Kissimmee", state: "FL", zip: "34741" },
      { company: "Winter Park Wireless", contact: "Kim Lee", phones: ["407.555.0203"], emails: ["wpw@wireless.example.com", "owner@wpw.example.com"], address: "400 S Park Ave", city: "Winter Park", state: "FL", zip: "32789" },
    ],
  },
  {
    name: "CSV with no header row",
    kind: "csv",
    file: () =>
      enc(`Tampa Bay Cell Repair,813-555-0210,tbcr@repair.example.com,Tampa,FL
Ybor Phone Shop,813-555-0211,,Tampa,FL
Brandon Mobile Clinic,813-555-0212,clinic@brandonmobile.example.com,Brandon,FL
`),
    expected: [
      { company: "Tampa Bay Cell Repair", phones: ["813-555-0210"], emails: ["tbcr@repair.example.com"], city: "Tampa", state: "FL" },
      { company: "Ybor Phone Shop", phones: ["813-555-0211"], city: "Tampa", state: "FL" },
      { company: "Brandon Mobile Clinic", phones: ["813-555-0212"], emails: ["clinic@brandonmobile.example.com"], city: "Brandon", state: "FL" },
    ],
  },
  {
    name: "Excel with a title above the header and a combined contact column",
    kind: "xlsx",
    file: async () => {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Leads");
      ws.addRow(["Charlotte prospects - October"]);
      ws.addRow([]);
      ws.addRow(["Shop", "", "Contact info", "Address"]);
      ws.addRow(["Queen City Wireless", "", "704-555-0220 qcw@wireless.example.com", "1600 E Woodlawn Rd, Charlotte, NC 28209"]);
      ws.addRow(["SouthPark Phone Repair", "", "(704) 555-0221", "4400 Sharon Rd Charlotte NC 28211"]);
      ws.addRow(["NoDa Cell Fix", "", "noda@cellfix.example.com / 980-555-0222", "3200 N Davidson St, Charlotte, NC 28205"]);
      return new Uint8Array(await wb.xlsx.writeBuffer());
    },
    expected: [
      { company: "Queen City Wireless", phones: ["704-555-0220"], emails: ["qcw@wireless.example.com"], address: "1600 E Woodlawn Rd", city: "Charlotte", state: "NC", zip: "28209" },
      { company: "SouthPark Phone Repair", phones: ["(704) 555-0221"], address: "4400 Sharon Rd", city: "Charlotte", state: "NC", zip: "28211" },
      { company: "NoDa Cell Fix", phones: ["980-555-0222"], emails: ["noda@cellfix.example.com"], address: "3200 N Davidson St", city: "Charlotte", state: "NC", zip: "28205" },
    ],
  },
  {
    name: "Word document with a paragraph per shop",
    kind: "docx",
    file: () =>
      docx([
        "Denver area leads",
        "Mile High Mobile Repair – 1550 Larimer St, Denver, CO 80202 – (303) 555-0230 – milehigh@mobilerepair.example.com",
        "Capitol Hill Cellular, owner Jake Moss. 720-555-0231. 1200 E Colfax Ave Denver CO 80218.",
        "Cherry Creek iRepair",
        "3000 E 1st Ave, Denver, CO 80206",
        "Phone: 303.555.0232   Web: cherrycreekirepair.example.com",
      ]),
    expected: [
      { company: "Mile High Mobile Repair", phones: ["(303) 555-0230"], emails: ["milehigh@mobilerepair.example.com"], address: "1550 Larimer St", city: "Denver", state: "CO", zip: "80202" },
      { company: "Capitol Hill Cellular", contact: "Jake Moss", phones: ["720-555-0231"], address: "1200 E Colfax Ave", city: "Denver", state: "CO", zip: "80218" },
      { company: "Cherry Creek iRepair", phones: ["303.555.0232"], website: "cherrycreekirepair.example.com", address: "3000 E 1st Ave", city: "Denver", state: "CO", zip: "80206" },
    ],
  },
  {
    name: "Word document with a table whose cells mix fields",
    kind: "docx",
    file: () =>
      docx([], [
        ["Business", "Details"],
        ["Nashville Phone Fixers", "615-555-0240, fixers@nashphone.example.com, 2000 Broadway, Nashville, TN 37203"],
        ["Music Row Wireless", "Tel 615 555 0241 · 1100 16th Ave S Nashville TN 37212 · ask for Beth"],
        ["Germantown Gadget Repair", "(615) 555-0242 germantowngadget.example.com"],
      ]),
    expected: [
      { company: "Nashville Phone Fixers", phones: ["615-555-0240"], emails: ["fixers@nashphone.example.com"], address: "2000 Broadway", city: "Nashville", state: "TN", zip: "37203" },
      { company: "Music Row Wireless", contact: "Beth", phones: ["615 555 0241"], address: "1100 16th Ave S", city: "Nashville", state: "TN", zip: "37212" },
      { company: "Germantown Gadget Repair", phones: ["(615) 555-0242"], website: "germantowngadget.example.com" },
    ],
  },
  {
    name: "PDF printout with stacked lines per shop",
    kind: "pdf",
    file: () =>
      pdf([
        "Las Vegas phone shops",
        "",
        "Strip Cell Repair",
        "3570 S Las Vegas Blvd, Las Vegas, NV 89109",
        "Tel: (702) 555-0250",
        "strip@cellrepair.example.com",
        "",
        "Henderson Wireless Hub",
        "702-555-0251   hub@hendersonwireless.example.com",
        "2300 W Horizon Ridge Pkwy, Henderson, NV 89052",
        "",
        "Summerlin Phone Care   (702) 555-0252",
        "1980 Festival Plaza Dr, Las Vegas NV 89135   summerlinphonecare.example.com",
      ]),
    expected: [
      { company: "Strip Cell Repair", phones: ["(702) 555-0250"], emails: ["strip@cellrepair.example.com"], address: "3570 S Las Vegas Blvd", city: "Las Vegas", state: "NV", zip: "89109" },
      { company: "Henderson Wireless Hub", phones: ["702-555-0251"], emails: ["hub@hendersonwireless.example.com"], address: "2300 W Horizon Ridge Pkwy", city: "Henderson", state: "NV", zip: "89052" },
      { company: "Summerlin Phone Care", phones: ["(702) 555-0252"], website: "summerlinphonecare.example.com", address: "1980 Festival Plaza Dr", city: "Las Vegas", state: "NV", zip: "89135" },
    ],
  },
];

/** A minimal .docx: paragraphs, then an optional table. */
function docx(paragraphs: string[], table?: string[][]): Uint8Array {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const p = (s: string) => `<w:p><w:r><w:t xml:space="preserve">${esc(s)}</w:t></w:r></w:p>`;
  const tbl = table ? `<w:tbl>${table.map((r) => `<w:tr>${r.map((c) => `<w:tc>${p(c)}</w:tc>`).join("")}</w:tr>`).join("")}</w:tbl>` : "";
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs.map(p).join("")}${tbl}</w:body></w:document>`;
  return zipSync({
    "[Content_Types].xml": strToU8(`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`),
    "_rels/.rels": strToU8(`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`),
    "word/document.xml": strToU8(doc),
  });
}

/** A one-page PDF with a text layer, one line per entry; runs of 3+ spaces become separate columns. */
function pdf(lines: string[]): Uint8Array {
  const runs: string[] = [];
  let y = 780;
  for (const line of lines) {
    if (line) {
      let x = 40;
      for (const part of line.split(/\s{3,}/)) {
        runs.push(`BT /F1 10 Tf ${x} ${y} Td (${part.replace(/[()\\]/g, "\\$&")}) Tj ET`);
        x += part.length * 5.5 + 40;
      }
    }
    y -= line ? 14 : 22;
  }
  const content = runs.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
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
