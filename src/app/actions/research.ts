"use server";

import { revalidatePath } from "next/cache";
import { FEATURES } from "@/lib/features";
import { z } from "zod";
import { requireUser } from "@/lib/auth/current";
import { asUser } from "@/lib/db";
import { limits } from "@/lib/rate-limit";
import { getResearchProvider, isProviderId } from "@/lib/research/providers";
import { RESEARCH_FIELDS, RESEARCH_MODES } from "@/lib/research/types";
import type { ActionState } from "./lead";

const RequestSchema = z.object({
  provider: z.string().refine(isProviderId, "Pick a provider."),
  mode: z.enum(RESEARCH_MODES),
  query: z.string().trim().min(1, "Say what to research.").max(500),
  location: z.string().trim().max(200).optional().transform((v) => v || null),
  fields: z.array(z.enum(RESEARCH_FIELDS)).min(1, "Pick at least one field to collect."),
  maxResults: z.coerce.number().int().min(1).max(500).default(25),
  intent: z.enum(["save", "run"]).default("save"),
});

/** Saves a research request. With no provider connected it waits; "run" says so instead of calling anything. */
export async function saveResearchRequest(_prev: ActionState, form: FormData): Promise<ActionState> {
  if (!FEATURES.researchAgent) return { error: "The research agent is switched off for now." };
  const user = await requireUser();
  const parsed = RequestSchema.safeParse({ ...Object.fromEntries(form), fields: form.getAll("fields") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  const d = parsed.data;
  if (d.mode === "website" && !/^(https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(d.query)) {
    return { error: "Enter a website address, e.g. shop.example.com." };
  }
  const provider = getResearchProvider(d.provider)!;
  if (d.intent === "run" && !provider.enabled) {
    return { error: `${provider.label} isn't connected yet, so nothing was run. Save the request and it will be ready when a provider is set up.` };
  }
  if (!limits.write.check(`write:${user.id}`).ok) return { error: "Too many changes in a minute. Slow down a little." };
  await asUser(user.id, async (tx) => {
    const [r] = await tx`insert into research_requests (created_by, provider, mode, query, location, fields, max_results)
      values (${user.id}, ${d.provider}, ${d.mode}, ${d.query}, ${d.location}, ${d.fields}, ${d.maxResults})
      returning id`;
    await tx`select app.log_audit('research.requested', 'research_requests', ${r.id}, ${tx.json({ provider: d.provider, mode: d.mode })})`;
  });
  revalidatePath("/research");
  return { ok: true, message: "Request saved. It will run once a provider is connected.", savedAt: Date.now() };
}

export async function cancelResearchRequest(form: FormData) {
  const user = await requireUser();
  const id = z.string().uuid().safeParse(form.get("id"));
  if (!id.success) return;
  await asUser(user.id, (tx) => tx`update research_requests set status = 'cancelled' where id = ${id.data} and status in ('waiting_for_provider', 'queued')`);
  revalidatePath("/research");
}
