"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Icon } from "./icons";

/**
 * Search box that updates the results as you type (after a short pause), keeping the other
 * filters in the URL and going back to page 1. The form's Search button still submits it.
 */
export function LiveSearch({ name = "q", defaultValue = "", placeholder, label }: { name?: string; defaultValue?: string; placeholder: string; label: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [value, setValue] = useState(defaultValue);
  // Follow the URL when it changes from outside the box (Clear all, back button).
  const urlValue = params.get(name) ?? "";
  const [seenUrl, setSeenUrl] = useState(urlValue);
  if (urlValue !== seenUrl) {
    setSeenUrl(urlValue);
    if (urlValue !== value.trim()) setValue(urlValue);
  }
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  function onChange(next: string) {
    setValue(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const p = new URLSearchParams(params.toString());
      const q = next.trim();
      if (q) p.set(name, q);
      else p.delete(name);
      p.delete("page");
      p.delete("msg");
      const qs = p.toString();
      startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
    }, 250);
  }

  return (
    <div className="relative flex-1">
      <Icon name="search" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
      <input
        id={name}
        name={name}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        autoComplete="off"
        className="input pr-9 pl-9"
      />
      {pending && <span className="absolute top-1/2 right-3 size-3.5 -translate-y-1/2 animate-spin rounded-full border-2 border-line border-t-brand" aria-hidden data-testid="search-pending" />}
    </div>
  );
}
