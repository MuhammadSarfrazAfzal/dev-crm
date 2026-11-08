import "server-only";
import type { Tx } from "@/lib/db";

export type ResearchRequestRow = {
  id: string;
  provider: string;
  mode: "website" | "company" | "area";
  query: string;
  location: string | null;
  fields: string[];
  max_results: number;
  status: string;
  result_count: number;
  import_id: string | null;
  created_at: Date;
  created_by_name: string | null;
};

export async function listResearchRequests(tx: Tx, limit = 20) {
  return (await tx`select r.id, r.provider, r.mode, r.query, r.location, r.fields, r.max_results, r.status,
      r.result_count, r.import_id, r.created_at, p.full_name as created_by_name
    from research_requests r left join profiles p on p.id = r.created_by
    order by r.created_at desc limit ${limit}`) as unknown as ResearchRequestRow[];
}
