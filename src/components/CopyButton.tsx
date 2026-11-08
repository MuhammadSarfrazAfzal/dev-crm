"use client";

import { useState } from "react";

export function CopyButton({ text, label = "Copy", className = "btn-secondary", onCopied }: { text: string; label?: string; className?: string; onCopied?: () => void }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for browsers that block the async clipboard API.
      const area = document.createElement("textarea");
      area.value = text;
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    setCopied(true);
    onCopied?.();
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <button type="button" onClick={copy} className={className} aria-live="polite">
      {copied ? "Copied" : label}
    </button>
  );
}
