"use client";

import { useState } from "react";
import type { ResearchResult } from "@/lib/research/types";
import { Icon } from "../icons";
import { Badge, Dash, EmptyState } from "../ui";

// Illustration only: shows the shape of results. Never saved, clearly labelled.
const EXAMPLE: ResearchResult[] = [
  { company: "Example Phone Repair", contactName: "Jordan Lee", title: "Owner", phones: ["(713) 555-0142"], emails: ["owner@example.com"], address: "100 Main St", city: "Houston", state: "TX", postalCode: "77002", website: "https://example.com", socials: ["facebook.com/example"], sourceUrl: "https://example.com/contact" },
  { company: "Sample Cell Clinic", phones: ["(512) 555-0188"], emails: [], address: "22 Oak Ave", city: "Austin", state: "TX", postalCode: "78701", sourceUrl: "https://example.org/listing" },
];

export function ResultsPreview() {
  const [showExample, setShowExample] = useState(false);
  const rows = showExample ? EXAMPLE : [];
  return (
    <section className="card overflow-hidden" aria-labelledby="results-title">
      <header className="flex flex-col gap-3 border-b border-line px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 id="results-title" className="text-sm font-semibold text-fg">Results preview</h2>
          <p className="mt-0.5 text-xs text-muted">Found businesses land here, then go to the same review and approval as an imported file.</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-muted">
            <input type="checkbox" checked={showExample} onChange={(e) => setShowExample(e.target.checked)} className="size-3.5" /> Show example rows
          </label>
          <button type="button" disabled className="btn-primary btn-sm" title="Available once an agent is connected and has returned results">
            <Icon name="arrowRight" className="size-3.5" /> Send to import review
          </button>
        </div>
      </header>
      {rows.length === 0 ? (
        <div className="p-5">
          <EmptyState icon="sparkles" title="No results yet">
            Nothing has been fetched. Results appear here after an agent is connected and a request runs.
          </EmptyState>
        </div>
      ) : (
        <>
          <div className="border-b border-warning-line bg-warning-soft px-5 py-2 text-xs text-warning-fg">Example rows to show the layout. Not real businesses and never saved.</div>
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Company</th><th>Contact</th><th>Phone</th><th>Email</th><th>Address</th><th>City</th><th>State</th><th>ZIP</th><th>Website</th><th>Socials</th><th>Source</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.company}>
                    <td className="font-medium whitespace-nowrap text-fg">{r.company} <Badge tone="amber">Example</Badge></td>
                    <td className="whitespace-nowrap">{r.contactName ? <>{r.contactName}{r.title && <div className="text-xs text-muted">{r.title}</div>}</> : <Dash />}</td>
                    <td className="whitespace-nowrap tabular-nums">{r.phones?.length ? r.phones.join(", ") : <Dash />}</td>
                    <td className="whitespace-nowrap">{r.emails?.length ? r.emails.join(", ") : <Dash />}</td>
                    <td className="whitespace-nowrap">{r.address ?? <Dash />}</td>
                    <td>{r.city ?? <Dash />}</td>
                    <td>{r.state ?? <Dash />}</td>
                    <td className="tabular-nums">{r.postalCode ?? <Dash />}</td>
                    <td className="whitespace-nowrap">{r.website ? r.website.replace(/^https?:\/\//, "") : <Dash />}</td>
                    <td className="whitespace-nowrap">{r.socials?.length ? r.socials.join(", ") : <Dash />}</td>
                    <td className="max-w-48 truncate text-xs text-muted">{r.sourceUrl ?? <Dash />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
