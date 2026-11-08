/**
 * Held-out samples: written after the parser changes and never tuned against, so the
 * benchmark also shows how the import does on messy input it has not seen before.
 */
import ExcelJS from "exceljs";
import type { Sample } from "./corpus";

const enc = (s: string) => new TextEncoder().encode(s);

export const HOLDOUT: Sample[] = [
  {
    name: "review-site listing with categories and neighbourhood",
    kind: "paste",
    text: `1. Wireless Doctor
4.5 (88 reviews)
Mobile Phone Repair, Electronics Repair
Downtown
(615) 555-0300
123 Church St
Nashville, TN 37219

2. Broadway Phone Stop
4.0 (12 reviews)
Mobile Phones
(615) 555-0309
401 Broadway
Nashville, TN 37203`,
    expected: [
      { company: "Wireless Doctor", phones: ["(615) 555-0300"], address: "123 Church St", city: "Nashville", state: "TN", zip: "37219" },
      { company: "Broadway Phone Stop", phones: ["(615) 555-0309"], address: "401 Broadway", city: "Nashville", state: "TN", zip: "37203" },
    ],
  },
  {
    name: "email signature with a job title",
    kind: "paste",
    text: `Thanks,
Robert King
General Manager | Cellular Express
(901) 555-0301 office | (901) 555-0302 cell
robert@cellularexpress.example.com
www.cellularexpress.example.com
4100 Poplar Ave, Memphis, TN 38117`,
    expected: [
      { company: "Cellular Express", contact: "Robert King", phones: ["(901) 555-0301", "(901) 555-0302"], emails: ["robert@cellularexpress.example.com"], website: "cellularexpress.example.com", address: "4100 Poplar Ave", city: "Memphis", state: "TN", zip: "38117" },
    ],
  },
  {
    name: "chat messages forwarded from a field rep",
    kind: "paste",
    text: `[10/20, 3:14 PM] Ali: new lead - Fix It Fast Phones, 901-555-0303, they're at 2200 Union Ave, Memphis, TN 38104
[10/20, 3:16 PM] Ali: another one Memphis Mobile Mart 901 555 0304 mobilemart@shop.example.com`,
    expected: [
      { company: "Fix It Fast Phones", phones: ["901-555-0303"], address: "2200 Union Ave", city: "Memphis", state: "TN", zip: "38104" },
      { company: "Memphis Mobile Mart", phones: ["901 555 0304"], emails: ["mobilemart@shop.example.com"] },
    ],
  },
  {
    name: "quoted comma lines with no header",
    kind: "paste",
    text: `"Smart Fix Wireless","502-555-0305","smartfix@wireless.example.com","Louisville","KY"
"Derby City Cellular","502-555-0312","","Louisville","KY"
"Highlands iRepair","502-555-0313","hi@irepair.example.com","Louisville","KY"`,
    expected: [
      { company: "Smart Fix Wireless", phones: ["502-555-0305"], emails: ["smartfix@wireless.example.com"], city: "Louisville", state: "KY" },
      { company: "Derby City Cellular", phones: ["502-555-0312"], city: "Louisville", state: "KY" },
      { company: "Highlands iRepair", phones: ["502-555-0313"], emails: ["hi@irepair.example.com"], city: "Louisville", state: "KY" },
    ],
  },
  {
    name: "a paragraph about several shops",
    kind: "paste",
    text: `We visited three shops on Bardstown Rd. Highlands Cell Repair (502-555-0306) is run by Omar; Bardstown Wireless at 1800 Bardstown Rd, Louisville, KY 40205 - 502.555.0307; and Phone Medics Louisville, email phonemedics@louisville.example.com.`,
    expected: [
      { company: "Highlands Cell Repair", phones: ["502-555-0306"] },
      { company: "Bardstown Wireless", phones: ["502.555.0307"], address: "1800 Bardstown Rd", city: "Louisville", state: "KY", zip: "40205" },
      { company: "Phone Medics Louisville", emails: ["phonemedics@louisville.example.com"] },
    ],
  },
  {
    name: "Excel with wordy headers",
    kind: "xlsx",
    file: async () => {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Sheet1");
      ws.addRow(["Name of Business", "Phone No.", "Email ID", "Full Address", "Owner/Manager"]);
      ws.addRow(["Circle City Phones", "317-555-0320", "circle@cityphones.example.com", "200 W Washington St, Indianapolis, IN 46204", "Dana White"]);
      ws.addRow(["Broad Ripple Repair", "(317) 555-0321", "", "6300 N College Ave Indianapolis IN 46220", ""]);
      return new Uint8Array(await wb.xlsx.writeBuffer());
    },
    expected: [
      { company: "Circle City Phones", contact: "Dana White", phones: ["317-555-0320"], emails: ["circle@cityphones.example.com"], address: "200 W Washington St", city: "Indianapolis", state: "IN", zip: "46204" },
      { company: "Broad Ripple Repair", phones: ["(317) 555-0321"], address: "6300 N College Ave", city: "Indianapolis", state: "IN", zip: "46220" },
    ],
  },
  {
    name: "tab-separated with phone and email in one column",
    kind: "txt",
    file: () =>
      enc(`Shop\tContact\tCity
Fountain Square Fix\t317-555-0322 / fsfix@repair.example.com\tIndianapolis
Carmel Cell Care\t(317) 555-0323\tCarmel
Fishers Phone Lab\tlab@fishersphone.example.com, 317.555.0324\tFishers
`),
    expected: [
      { company: "Fountain Square Fix", phones: ["317-555-0322"], emails: ["fsfix@repair.example.com"], city: "Indianapolis" },
      { company: "Carmel Cell Care", phones: ["(317) 555-0323"], city: "Carmel" },
      { company: "Fishers Phone Lab", phones: ["317.555.0324"], emails: ["lab@fishersphone.example.com"], city: "Fishers" },
    ],
  },
  {
    name: "classified ad style",
    kind: "paste",
    text: `FAST PHONE REPAIR!!! Call/Text 317-555-0311 - located at 5500 E 82nd St Indianapolis IN 46250 - ask for Kevin

Cracked screen? Speedway Cell Fix fixes it same day. 317-555-0325. 1400 Main St, Speedway, IN 46224`,
    expected: [
      { company: "FAST PHONE REPAIR", contact: "Kevin", phones: ["317-555-0311"], address: "5500 E 82nd St", city: "Indianapolis", state: "IN", zip: "46250" },
      { company: "Speedway Cell Fix", phones: ["317-555-0325"], address: "1400 Main St", city: "Speedway", state: "IN", zip: "46224" },
    ],
  },
];
