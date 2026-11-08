import ExcelJS from "exceljs";
import { tableFromRows } from "../table-shape";
import type { ExtractedTable, Extractor } from "../types";

const MAX_ROWS = 20_000;

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("text" in value && typeof value.text === "string") return value.text; // hyperlink
    if ("richText" in value) return value.richText.map((r) => r.text).join("");
    if ("result" in value) return cellText(value.result as ExcelJS.CellValue); // formula: use cached result only
    if ("error" in value) return "";
    return "";
  }
  return String(value);
}

export const xlsxExtractor: Extractor = {
  name: "exceljs",
  kinds: ["xlsx"],
  async extract(file) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(file.data) as unknown as ArrayBuffer);
    const tables: ExtractedTable[] = [];
    const notes: string[] = [];
    wb.eachSheet((sheet) => {
      const rows: string[][] = [];
      sheet.eachRow({ includeEmpty: false }, (row) => {
        if (rows.length > MAX_ROWS) return;
        const values: string[] = [];
        for (let c = 1; c <= Math.min(sheet.columnCount, 100); c++) values.push(cellText(row.getCell(c).value).trim());
        if (values.some(Boolean)) rows.push(values);
      });
      if (rows.length < 2) {
        if (rows.length) notes.push(`${file.name} › ${sheet.name}: only one row, skipped`);
        return;
      }
      const shaped = tableFromRows(rows, `${file.name} › ${sheet.name}`);
      if (shaped.table) tables.push(shaped.table);
      notes.push(...shaped.notes);
      if (rows.length > MAX_ROWS) notes.push(`${sheet.name}: only the first ${MAX_ROWS} rows were read`);
    });
    return { tables, texts: [], notes, parsers: ["exceljs"] };
  },
};
