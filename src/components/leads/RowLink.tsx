"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

/**
 * A table row that opens `href` when clicked anywhere, except on its own controls
 * (checkbox, links, buttons), which keep their usual behaviour. Middle/Ctrl-click opens a
 * new tab like a link would.
 */
export function RowLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  const router = useRouter();
  return (
    <tr
      className={className}
      data-href={href}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a, button, input, label, select, textarea")) return;
        if (window.getSelection()?.toString()) return; // let people copy text from a row
        if (e.metaKey || e.ctrlKey) window.open(href, "_blank", "noopener");
        else router.push(href);
      }}
      onAuxClick={(e) => {
        if (e.button === 1 && !(e.target as HTMLElement).closest("a, button, input, label")) window.open(href, "_blank", "noopener");
      }}
    >
      {children}
    </tr>
  );
}
