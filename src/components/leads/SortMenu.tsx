"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Dropdown } from "../menu/Dropdown";

const OPTIONS = [
  { value: "next", label: "Next follow-up" },
  { value: "company", label: "Company A–Z" },
  { value: "company:desc", label: "Company Z–A" },
  { value: "last_call:desc", label: "Recently called" },
  { value: "last_call", label: "Longest since a call" },
  { value: "attempts:desc", label: "Most calls" },
  { value: "created:desc", label: "Newest leads" },
  { value: "owner", label: "Assigned" },
  { value: "status", label: "Status" },
];

/** Phones: the table headers aren't shown, so sorting is a menu above the cards. */
export function SortMenu() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = `${params.get("sort") ?? "next"}${params.get("dir") === "desc" ? ":desc" : ""}`;
  return (
    <Dropdown
      ariaLabel="Sort leads"
      testId="sort-menu"
      options={OPTIONS}
      value={OPTIONS.some((o) => o.value === current) ? current : "next"}
      onChange={(v) => {
        const [sort, dir] = v.split(":");
        const p = new URLSearchParams(params.toString());
        if (sort === "next") p.delete("sort");
        else p.set("sort", sort);
        if (dir) p.set("dir", dir);
        else p.delete("dir");
        p.delete("page");
        router.replace(`${pathname}?${p.toString()}`, { scroll: false });
      }}
      className="py-1.5"
    />
  );
}
