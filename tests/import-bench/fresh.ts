/**
 * A third set, written after all parser changes and run once to measure how the import
 * handles messy input it has never been tuned on. Kept as-is afterwards.
 */
import ExcelJS from "exceljs";
import type { Sample } from "./corpus";

const enc = (s: string) => new TextEncoder().encode(s);

export const FRESH: Sample[] = [
  {
    name: "social media post with emoji markers",
    kind: "paste",
    text: `📱 iPhone Repair Hub 📱
📍 7700 W Bell Rd, Glendale AZ 85308
☎️ 623-555-0400
✉️ hub@iphonerepairhub.example.com`,
    expected: [{ company: "iPhone Repair Hub", phones: ["623-555-0400"], emails: ["hub@iphonerepairhub.example.com"], address: "7700 W Bell Rd", city: "Glendale", state: "AZ", zip: "85308" }],
  },
  {
    name: "labels run together on one line",
    kind: "paste",
    text: `Name: Desert Cell Doctor Number: 480-555-0401 Mail: doctor@desertcell.example.com Address: 1600 S Gilbert Rd, Gilbert, AZ 85296`,
    expected: [{ company: "Desert Cell Doctor", phones: ["480-555-0401"], emails: ["doctor@desertcell.example.com"], address: "1600 S Gilbert Rd", city: "Gilbert", state: "AZ", zip: "85296" }],
  },
  {
    name: "phone with an extension",
    kind: "paste",
    text: `Tucson Tech Repair 520-555-0402 x12, 4400 E Broadway Blvd, Tucson, AZ 85711`,
    expected: [{ company: "Tucson Tech Repair", phones: ["520-555-0402"], address: "4400 E Broadway Blvd", city: "Tucson", state: "AZ", zip: "85711" }],
  },
  {
    name: "table copied out of a PDF (spaces as columns)",
    kind: "paste",
    text: `Company              Phone            City
Yuma Phone Fix       928-555-0403     Yuma
Flagstaff Fone       928-555-0404     Flagstaff`,
    expected: [
      { company: "Yuma Phone Fix", phones: ["928-555-0403"], city: "Yuma" },
      { company: "Flagstaff Fone", phones: ["928-555-0404"], city: "Flagstaff" },
    ],
  },
  {
    name: "dash-separated note with an owner",
    kind: "paste",
    text: `Sunrise Wireless - owner is Maria Lopez - 602 555 0405 - wants POS demo next week`,
    expected: [{ company: "Sunrise Wireless", contact: "Maria Lopez", phones: ["602 555 0405"] }],
  },
  {
    name: "contact first, then the shop",
    kind: "paste",
    text: `Contact: John at Valley Mobile, 480-555-0406, john@valleymobile.example.com`,
    expected: [{ company: "Valley Mobile", contact: "John", phones: ["480-555-0406"], emails: ["john@valleymobile.example.com"] }],
  },
  {
    name: "CSV with full state names and ZIP+4",
    kind: "csv",
    file: () =>
      enc(`Business Name,Address,City,State,Zip,Phone,Email
Prescott Phone Pros,123 N Montezuma St,Prescott,Arizona,86301-1234,(928) 555-0407,
Sedona Cell Stop,2370 W State Route 89A,Sedona,Arizona,86336,928.555.0409,stop@sedonacell.example.com
`),
    expected: [
      { company: "Prescott Phone Pros", phones: ["(928) 555-0407"], address: "123 N Montezuma St", city: "Prescott", state: "AZ" },
      { company: "Sedona Cell Stop", phones: ["928.555.0409"], emails: ["stop@sedonacell.example.com"], address: "2370 W State Route 89A", city: "Sedona", state: "AZ", zip: "86336" },
    ],
  },
  {
    name: "Excel with everything in one column",
    kind: "xlsx",
    file: async () => {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Leads");
      ws.addRow(["Lead"]);
      ws.addRow(["Chandler Cell Clinic - 2950 W Chandler Blvd Chandler AZ 85224 - 480-555-0408"]);
      ws.addRow(["Peoria Phone Shop - 602-555-0410 - peoria@phoneshop.example.com"]);
      return new Uint8Array(await wb.xlsx.writeBuffer());
    },
    expected: [
      { company: "Chandler Cell Clinic", phones: ["480-555-0408"], address: "2950 W Chandler Blvd", city: "Chandler", state: "AZ", zip: "85224" },
      { company: "Peoria Phone Shop", phones: ["602-555-0410"], emails: ["peoria@phoneshop.example.com"] },
    ],
  },
];
