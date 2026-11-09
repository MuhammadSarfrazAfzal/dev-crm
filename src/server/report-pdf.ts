import "server-only";
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import { duration, money, percent, plural } from "@/lib/format";
import { DEAL_STAGES, LEAD_STATUSES, LEAD_STATUS_LABEL, OUTCOME_LABEL, HIDDEN_CALL_OUTCOMES, PRODUCT_LABEL, PRODUCT_SHORT, stageLabel, type CallOutcome, type DealStage, type LeadStatus, type Product } from "@/lib/labels";
import { formatInZone, PAKISTAN_TZ } from "@/lib/time";
import { PERIODS, periodLabel, type Activity, type Report } from "./reports";

/**
 * The Reports page as a shareable PDF: the same numbers (built from the same report data),
 * laid out for print. Pure JavaScript with the standard PDF fonts, so it runs anywhere,
 * including Vercel, without a browser.
 */

const C = {
  brand: rgb(0.31, 0.27, 0.9),
  brandSoft: rgb(0.93, 0.93, 1),
  ink: rgb(0.06, 0.09, 0.16),
  text: rgb(0.2, 0.25, 0.33),
  muted: rgb(0.39, 0.45, 0.55),
  line: rgb(0.89, 0.91, 0.94),
  soft: rgb(0.97, 0.98, 0.99),
  green: rgb(0.02, 0.59, 0.41),
  red: rgb(0.86, 0.15, 0.15),
  amber: rgb(0.85, 0.47, 0.02),
  white: rgb(1, 1, 1),
};

const W = 792; // US Letter, landscape
const H = 612;
const M = 36;
const CW = W - 2 * M;

type Opts = { font?: "regular" | "bold"; size?: number; color?: RGB; align?: "left" | "right" | "center" };

class Doc {
  pdf!: PDFDocument;
  page!: PDFPage;
  regular!: PDFFont;
  bold!: PDFFont;
  y = 0;
  private chars = new Set<number>();

  static async create() {
    const d = new Doc();
    d.pdf = await PDFDocument.create();
    d.regular = await d.pdf.embedFont(StandardFonts.Helvetica);
    d.bold = await d.pdf.embedFont(StandardFonts.HelveticaBold);
    d.chars = new Set(d.regular.getCharacterSet());
    return d;
  }

  /** Standard PDF fonts cover Western text; anything else becomes "?" instead of failing. */
  clean(s: string) {
    return [...s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/…/g, "...").replace(/[\r\n\t]+/g, " ")]
      .map((ch) => (this.chars.has(ch.codePointAt(0)!) ? ch : "?"))
      .join("");
  }

  newPage() {
    this.page = this.pdf.addPage([W, H]);
    this.y = H - M;
  }

  ensure(h: number) {
    if (this.y - h < M + 24) this.newPage();
  }

  width(s: string, size = 9, font: "regular" | "bold" = "regular") {
    return (font === "bold" ? this.bold : this.regular).widthOfTextAtSize(this.clean(s), size);
  }

  text(s: string, x: number, y: number, o: Opts = {}) {
    const size = o.size ?? 9;
    const font = o.font === "bold" ? this.bold : this.regular;
    const t = this.clean(s);
    const w = font.widthOfTextAtSize(t, size);
    const dx = o.align === "right" ? -w : o.align === "center" ? -w / 2 : 0;
    this.page.drawText(t, { x: x + dx, y, size, font, color: o.color ?? C.text });
  }

  /** Cuts text to fit a width, adding "..." when it had to be shortened. */
  fit(s: string, max: number, size = 9, font: "regular" | "bold" = "regular") {
    let t = this.clean(s);
    if (this.width(t, size, font) <= max) return t;
    while (t.length > 1 && this.width(`${t}...`, size, font) > max) t = t.slice(0, -1);
    return `${t.trimEnd()}...`;
  }

  /** Wraps text into lines no wider than `max`. */
  wrap(s: string, max: number, size = 9, font: "regular" | "bold" = "regular", maxLines = 6) {
    const words = this.clean(s).split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (this.width(next, size, font) <= max) cur = next;
      else {
        if (cur) lines.push(cur);
        cur = this.width(w, size, font) > max ? this.fit(w, max, size, font) : w;
      }
    }
    if (cur) lines.push(cur);
    if (lines.length > maxLines) {
      lines.length = maxLines;
      lines[maxLines - 1] = this.fit(`${lines[maxLines - 1]} ...`, max, size, font);
    }
    return lines;
  }

  rect(x: number, y: number, w: number, h: number, color: RGB, border?: RGB) {
    this.page.drawRectangle({ x, y, width: w, height: h, color, borderColor: border, borderWidth: border ? 0.75 : 0 });
  }

  hline(y: number, x = M, w = CW, color = C.line) {
    this.page.drawLine({ start: { x, y }, end: { x: x + w, y }, thickness: 0.6, color });
  }

  /** A section title; `keep` is the room the first block under it needs, so titles never sit alone at a page end. */
  heading(title: string, sub?: string, keep = 46) {
    this.ensure(keep);
    this.y -= 14;
    this.text(title, M, this.y, { font: "bold", size: 13, color: C.ink });
    if (sub) this.text(sub, M + this.width(title, 13, "bold") + 10, this.y + 1, { size: 8.5, color: C.muted });
    this.y -= 10;
  }
}

type Col = { label: string; w: number; align?: "left" | "right"; get: (row: never) => string; wrap?: boolean; color?: (row: never) => RGB | undefined; bold?: boolean };

/** A table that repeats its header on every page and wraps long cells. */
function table<T>(d: Doc, cols: (Omit<Col, "get" | "color"> & { get: (r: T) => string; color?: (r: T) => RGB | undefined })[], rows: T[], { size = 8 } = {}) {
  const total = cols.reduce((s, c) => s + c.w, 0);
  const scale = CW / total;
  const widths = cols.map((c) => c.w * scale);
  const pad = 5;
  const lineH = size + 3;
  // Column titles wrap onto a second line instead of being cut off.
  const titles = cols.map((c, i) => d.wrap(c.label, widths[i] - 2 * pad, size, "bold", 2));
  const headerH = Math.max(...titles.map((t) => t.length)) * lineH + 6;
  const header = () => {
    d.ensure(headerH + 6);
    d.rect(M, d.y - headerH, CW, headerH, C.soft);
    let x = M;
    cols.forEach((c, i) => {
      const lines = titles[i];
      lines.forEach((l, li) => d.text(l, c.align === "right" ? x + widths[i] - pad : x + pad, d.y - headerH + 4 + (lines.length - 1 - li) * lineH, { size, font: "bold", color: C.muted, align: c.align }));
      x += widths[i];
    });
    d.y -= headerH;
  };
  header();
  rows.forEach((r, ri) => {
    const cells = cols.map((c, i) => (c.wrap ? d.wrap(c.get(r) || "-", widths[i] - 2 * pad, size) : [d.fit(c.get(r) || "-", widths[i] - 2 * pad, size, c.bold ? "bold" : "regular")]));
    const h = Math.max(...cells.map((x) => x.length)) * lineH + 6;
    if (d.y - h < M + 24) {
      d.newPage();
      header();
    }
    if (ri % 2 === 1) d.rect(M, d.y - h, CW, h, C.soft);
    let x = M;
    cells.forEach((lines, i) => {
      const c = cols[i];
      lines.forEach((l, li) => d.text(l, c.align === "right" ? x + widths[i] - pad : x + pad, d.y - 3 - size - li * lineH + 1, { size, align: c.align, font: c.bold ? "bold" : "regular", color: c.color?.(r) ?? C.text }));
      x += widths[i];
    });
    d.y -= h;
  });
  d.hline(d.y);
  d.y -= 6;
}

function kpis(d: Doc, t: Activity) {
  const items: [string, string, string, RGB][] = [
    ["Calls made", String(t.calls), t.talk_seconds > 0 ? `${plural(t.leads_worked, "shop")} · ${duration(t.talk_seconds)} talk time` : `${plural(t.leads_worked, "unique shop")} contacted`, C.ink],
    ["Conversations", String(t.connects), `${percent(t.connects, t.calls)} of calls reached someone`, C.brand],
    ["Interested", String(t.interested), `${t.not_interested} not interested · ${t.no_reach} no answer`, C.green],
    ["Whatsapp Message Sent", String(t.followups_done), `${t.whatsapp_to_send} in WhatsApp to send`, C.green],
    ["Pending WhatsApp", String(t.whatsapp_to_send), "As of now", t.whatsapp_to_send ? C.amber : C.ink],
    ["Emails sent", String(t.emails_sent), `${t.emails_to_send} in Emails to send`, C.ink],
    ["Leads added", String(t.leads_added), `${t.leads_owned} owned in total`, C.ink],
    ["Not called yet", String(t.not_called), "Open leads, as of now", C.ink],
  ];
  const gap = 8;
  const w = (CW - 3 * gap) / 4;
  const h = 58;
  for (let row = 0; row < 2; row++) {
    d.ensure(h + gap);
    items.slice(row * 4, row * 4 + 4).forEach(([label, value, hint, color], i) => {
      const x = M + i * (w + gap);
      d.rect(x, d.y - h, w, h, C.white, C.line);
      d.text(label, x + 10, d.y - 15, { size: 8, color: C.muted });
      d.text(value, x + 10, d.y - 37, { size: 18, font: "bold", color });
      d.text(d.fit(hint, w - 20, 7.5), x + 10, d.y - 50, { size: 7.5, color: C.muted });
    });
    d.y -= h + gap;
  }
}

function barList(d: Doc, x: number, w: number, top: number, rows: { label: string; value: number; hint?: string }[], empty: string) {
  let y = top;
  const sum = rows.reduce((s, r) => s + r.value, 0);
  if (!rows.length || !sum) {
    d.text(empty, x, y - 12, { size: 8.5, color: C.muted });
    return y - 20;
  }
  const max = Math.max(1, ...rows.map((r) => r.value));
  const labelW = Math.min(120, w * 0.42);
  const valueW = 56;
  const barW = w - labelW - valueW - 8;
  for (const r of rows) {
    y -= 15;
    d.text(d.fit(r.label, labelW - 6, 8.5), x, y, { size: 8.5, color: C.text });
    d.rect(x + labelW, y - 1, barW, 8, C.soft);
    if (r.value) d.rect(x + labelW, y - 1, Math.max(1.5, (r.value / max) * barW), 8, C.brand);
    d.text(`${r.value}  ${percent(r.value, sum)}`, x + w, y, { size: 8.5, align: "right", color: C.ink });
    if (r.hint) {
      y -= 10;
      d.text(r.hint, x + labelW, y, { size: 7, color: C.muted });
    }
  }
  return y - 6;
}

function chart(d: Doc, x: number, w: number, top: number, series: Report["series"]) {
  const h = 120;
  const b = series.buckets;
  if (!b.some((v) => v.calls)) {
    d.text("No calls in this period.", x, top - 12, { size: 8.5, color: C.muted });
    return top - 20;
  }
  const max = Math.max(1, ...b.map((v) => v.calls));
  const base = top - h;
  // Light gridlines with the scale.
  for (const f of [0.5, 1]) {
    d.hline(base + h * f, x, w);
    d.text(String(Math.round(max * f)), x - 3, base + h * f - 3, { size: 6.5, color: C.muted, align: "right" });
  }
  d.hline(base, x, w, C.muted);
  const slot = w / b.length;
  const bw = Math.max(2, Math.min(28, slot * 0.7));
  const every = Math.ceil(b.length / 12);
  b.forEach((v, i) => {
    const cx = x + i * slot + (slot - bw) / 2;
    if (v.calls) d.rect(cx, base, bw, (v.calls / max) * h, C.brandSoft);
    if (v.connects) d.rect(cx, base, bw, (v.connects / max) * h, C.brand);
    if (i % every === 0) d.text(v.label, cx + bw / 2, base - 10, { size: 6.5, color: C.muted, align: "center" });
  });
  d.rect(x, base - 26, 7, 7, C.brandSoft);
  d.text("Calls", x + 10, base - 25, { size: 7.5, color: C.muted });
  d.rect(x + 45, base - 26, 7, 7, C.brand);
  d.text("Conversations", x + 55, base - 25, { size: 7.5, color: C.muted });
  return base - 34;
}

const outcome = (o: string) => OUTCOME_LABEL[o as CallOutcome] ?? o;
const products = (interested: string[], bought: string[]) =>
  [...interested.filter((p) => !bought.includes(p)).map((p) => `wants ${PRODUCT_SHORT[p as Product] ?? p}`), ...bought.map((p) => `bought ${PRODUCT_SHORT[p as Product] ?? p}`)].join(", ");

export async function reportPdf(r: Report, { preparedFor, repName }: { preparedFor: string; repName: string | null }): Promise<Uint8Array> {
  const d = await Doc.create();
  const tz = r.timeZone;
  const generatedAt = r.range.until;
  const when = (x: Date | string) => formatInZone(x, tz, { weekday: undefined });
  const title = repName ? `Sales report · ${repName}` : "Sales report · Whole team";
  d.pdf.setTitle(`${title} · ${PERIODS[r.period]}`);
  d.pdf.setAuthor("Devsolutionspk Sales CRM");
  d.pdf.setCreationDate(generatedAt);

  // Cover band.
  d.newPage();
  d.rect(0, H - 104, W, 104, C.brand);
  d.text("DEVSOLUTIONSPK SALES CRM · 8STAROS POS & WHOLESALE", M, H - 30, { size: 8, font: "bold", color: rgb(0.8, 0.8, 1) });
  d.text(title, M, H - 56, { size: 22, font: "bold", color: C.white });
  d.text(`${periodLabel(r.period, r.range, tz)} · USA time`, M, H - 76, { size: 10.5, color: C.white });
  d.text(`Generated ${formatInZone(generatedAt, tz, { year: "numeric" })} (${formatInZone(generatedAt, PAKISTAN_TZ, { weekday: undefined })} in Pakistan) · prepared by ${preparedFor}`, M, H - 93, { size: 8, color: rgb(0.85, 0.85, 1) });
  d.y = H - 104 - 18;

  kpis(d, r.totals);

  // Calls over time and call results.
  d.heading("Calls over time", `per ${r.series.unit}, USA time`);
  const top = d.y;
  d.ensure(170);
  const left = CW * 0.58;
  const yChart = chart(d, M + 18, left - 30, d.y - 6, r.series);
  d.text("Call results", M + left + 10, top + 8, { size: 10, font: "bold", color: C.ink });
  const yBars = barList(d, M + left + 10, CW - left - 10, top - 4, r.outcomes.filter((o) => !HIDDEN_CALL_OUTCOMES.has(o.outcome)).map((o) => ({ label: outcome(o.outcome), value: o.n })), "No calls in this period.");
  d.y = Math.min(yChart, yBars) - 6;

  if (!repName) {
    d.heading("By salesperson", "what each person did in this period");
    table(d, [
      { label: "Person", w: 100, get: (p) => `${p.full_name}${p.active ? "" : " (inactive)"}`, bold: true },
      { label: "Calls", w: 40, align: "right", get: (p) => String(p.calls) },
      { label: "Conversations", w: 82, align: "right", get: (p) => `${p.connects} (${percent(p.connects, p.calls)})` },
      { label: "Interested", w: 60, align: "right", get: (p) => String(p.interested) },
      { label: "No answer", w: 50, align: "right", get: (p) => String(p.no_reach) },
      { label: "Not interested", w: 60, align: "right", get: (p) => String(p.not_interested) },
      { label: "WhatsApp to send / done", w: 90, align: "right", get: (p) => `${p.followups_scheduled} / ${p.followups_done}` },
      { label: "Pending", w: 42, align: "right", get: (p) => String(p.overdue), color: (p) => (p.overdue ? C.amber : undefined) },
      { label: "Emails sent", w: 50, align: "right", get: (p) => String(p.emails_sent) },
      { label: "Deals won", w: 70, align: "right", get: (p) => `${p.deals_won}${p.won_value_cents ? ` · ${money(p.won_value_cents)}` : ""}` },
      { label: "Shops called", w: 54, align: "right", get: (p) => String(p.leads_worked) },
      { label: "Last call", w: 104, get: (p) => (p.last_call_at ? when(p.last_call_at) : "-") },
    ], r.people);
  }

  // Each person in detail.
  const people = r.people.filter((p) => repName || p.calls || p.followups_scheduled || p.emails_logged || p.deals_won || p.leads_owned);
  d.heading(repName ? "In detail" : "Each salesperson in detail", "this period, plus their pipeline as of now", 180);
  for (const p of people) {
    const lines: [string, string][] = [
      ["Calls", `${p.calls} calls to ${plural(p.leads_worked, "shop")}${p.talk_seconds > 0 ? ` · ${duration(p.talk_seconds)} talk time` : ""}${p.first_call_at ? ` · first ${when(p.first_call_at)}, last ${when(p.last_call_at!)}` : ""}`],
      ["Results", `${p.connects} conversations (${percent(p.connects, p.calls)}) · ${p.interested} interested · ${p.not_interested} not interested · ${p.no_reach} no answer / busy · ${p.wrong_number} wrong number`],
      ["Products", `8staros POS: ${p.pos_interest} calls with interest, ${p.pos_bought} with a sale · Wholesale: ${p.wholesale_interest} with interest, ${p.wholesale_bought} with a sale`],
      ["WhatsApp", `${p.followups_done} messages sent · ${p.followups_scheduled} scheduled to send · ${p.overdue} pending now`],
      ["Emails", `${p.emails_sent} sent · ${p.emails_logged} email steps logged`],
      ["Deals", `${p.deals_won} won (${money(p.won_value_cents)}) · ${p.open_deals} open (${money(p.open_value_cents)})`],
      ["Leads", `${p.leads_owned} owned · ${p.not_called} not called yet · ${p.leads_added} added in this period`],
    ];
    const wrapped = lines.map(([k, v]) => [k, d.wrap(v, CW - 110, 8.5)] as const);
    const h = 22 + wrapped.reduce((s, [, l]) => s + l.length * 11, 0) + 6;
    d.ensure(h);
    d.rect(M, d.y - h, CW, h, C.white, C.line);
    d.rect(M, d.y - h, 3, h, C.brand);
    d.text(`${p.full_name}${p.role === "admin" ? "  (admin)" : ""}${p.active ? "" : "  (inactive)"}`, M + 12, d.y - 15, { size: 10.5, font: "bold", color: C.ink });
    let y = d.y - 30;
    for (const [k, l] of wrapped) {
      d.text(k, M + 12, y, { size: 8.5, font: "bold", color: C.muted });
      l.forEach((line, i) => d.text(line, M + 96, y - i * 11, { size: 8.5 }));
      y -= l.length * 11;
    }
    d.y -= h + 8;
  }

  // Products, pipeline and leads.
  d.heading("Products", "calls in this period that showed interest or a sale; shops as of now");
  const prodRows = [
    ...(["pos", "wholesale"] as Product[]).map((p) => {
      const row = r.products.find((x) => x.product === p);
      return {
        name: PRODUCT_LABEL[p],
        interest: String(p === "pos" ? r.totals.pos_interest : r.totals.wholesale_interest),
        sale: String(p === "pos" ? r.totals.pos_bought : r.totals.wholesale_bought),
        shops: repName ? "-" : `${row?.interested ?? 0} interested · ${row?.bought ?? 0} bought`,
        deals: repName ? "-" : `${row?.deals_won ?? 0} · ${money(Number(row?.won_value_cents ?? 0))}`,
      };
    }),
    ...(repName ? [] : [{ name: "Deals for both products", interest: "-", sale: "-", shops: "-", deals: `${r.products.find((x) => x.product === "both")?.deals_won ?? 0} · ${money(Number(r.products.find((x) => x.product === "both")?.won_value_cents ?? 0))}` }]),
  ];
  table(d, [
    { label: "Product", w: 200, get: (x) => x.name, bold: true },
    { label: "Calls with interest", w: 110, align: "right", get: (x) => x.interest },
    { label: "Calls with a sale", w: 110, align: "right", get: (x) => x.sale },
    { label: "Shops now", w: 180, align: "right", get: (x) => x.shops },
    { label: "Deals won", w: 120, align: "right", get: (x) => x.deals },
  ], prodRows);

  d.ensure(150);
  d.heading("Deals and leads", "as of now");
  d.y -= 8;
  const t2 = d.y;
  const half = (CW - 20) / 2;
  d.text(repName ? "Their deals by stage" : "Deals by stage", M, t2 - 2, { size: 9.5, font: "bold", color: C.ink });
  const yA = barList(d, M, half, t2 - 6, DEAL_STAGES.map((s) => {
    const row = r.stages.find((x) => x.stage === s);
    return { label: stageLabel(s as DealStage), value: row?.n ?? 0, hint: row?.value_cents ? money(Number(row.value_cents)) : undefined };
  }), "No deals yet.");
  d.text(repName ? "Their leads by status" : "Leads by status", M + half + 20, t2 - 2, { size: 9.5, font: "bold", color: C.ink });
  const yB = barList(d, M + half + 20, half, t2 - 6, LEAD_STATUSES.map((s) => ({ label: LEAD_STATUS_LABEL[s as LeadStatus], value: r.statuses.find((x) => x.status === s)?.n ?? 0 })), "No leads yet.");
  d.y = Math.min(yA, yB) - 4;

  // The full logs.
  d.heading("Call log", `${r.calls.length} call${r.calls.length === 1 ? "" : "s"}, newest first, USA time${r.totals.calls > r.calls.length ? ` (latest ${r.calls.length} of ${r.totals.calls})` : ""}`);
  if (!r.calls.length) d.text("No calls in this period.", M, (d.y -= 12), { size: 8.5, color: C.muted });
  else
    table(d, [
      { label: "When", w: 92, get: (c) => when(c.occurred_at) },
      { label: "Shop", w: 140, get: (c) => `${c.company}${c.city ? ` · ${c.city}, ${c.state ?? ""}` : ""}`, wrap: true },
      { label: "Result", w: 90, get: (c) => `${outcome(c.outcome)}${c.duration_seconds ? ` · ${duration(c.duration_seconds)}` : ""}`, wrap: true },
      ...(repName ? [] : [{ label: "By", w: 70, get: (c: Report["calls"][number]) => c.user_name ?? "-" }]),
      { label: "Next step / notes", w: 220, get: (c) => [c.next_step && `Next: ${c.next_step}`, c.notes].filter(Boolean).join(" · "), wrap: true },
      { label: "Products", w: 90, get: (c) => products(c.interested_in, c.bought), wrap: true },
    ], r.calls);

  d.heading("WhatsApp to send", `${r.followups.length} in this period`);
  if (!r.followups.length) d.text("None in this period.", M, (d.y -= 12), { size: 8.5, color: C.muted });
  else
    table(d, [
      { label: "When", w: 92, get: (f) => when(f.created_at) },
      { label: "Shop", w: 140, get: (f) => f.company, wrap: true },
      { label: "Phone", w: 100, get: (f) => f.phone ?? "-" },
      { label: "Status", w: 60, get: (f) => (f.status === "pending" ? "Pending" : f.status === "done" ? "Done" : "Cancelled"), color: (f) => (f.status === "pending" ? C.brand : undefined) },
      ...(repName ? [] : [{ label: "By", w: 75, get: (f: Report["followups"][number]) => f.created_by_name ?? "-" }]),
      { label: "Notes", w: 240, get: (f) => f.notes ?? "WhatsApp to send", wrap: true },
    ], r.followups);

  // Footer on every page.
  const pages = d.pdf.getPages();
  pages.forEach((pg: any, i: number) => {
    d.page = pg;
    d.hline(M - 6);
    d.text(`Devsolutionspk Sales CRM · ${title} · ${PERIODS[r.period]}`, M, M - 18, { size: 7.5, color: C.muted });
    d.text(`Page ${i + 1} of ${pages.length}`, W - M, M - 18, { size: 7.5, color: C.muted, align: "right" });
  });
  return d.pdf.save();
}
