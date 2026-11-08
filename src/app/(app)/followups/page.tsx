import { redirect } from "next/navigation";

export default async function FollowupsRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const q = new URLSearchParams(
    Object.entries(sp).filter(([, v]) => v !== undefined) as [string, string][]
  ).toString();
  redirect(`/whatsapp${q ? `?${q}` : ""}`);
}
