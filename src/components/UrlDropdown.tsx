"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Dropdown, type DropdownOption } from "./menu/Dropdown";

/** A filter dropdown that applies on pick by updating one URL parameter (back to page 1). */
export function UrlDropdown({ param, options, ariaLabel, testId, className }: { param: string; options: DropdownOption[]; ariaLabel: string; testId?: string; className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();
  return (
    <Dropdown
      ariaLabel={ariaLabel}
      testId={testId}
      className={className}
      options={options}
      value={params.get(param) ?? ""}
      onChange={(v) => {
        const p = new URLSearchParams(params.toString());
        if (v) p.set(param, v);
        else p.delete(param);
        p.delete("page");
        const qs = p.toString();
        startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
      }}
    />
  );
}
