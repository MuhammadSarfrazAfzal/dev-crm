"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useEffect } from "react";
import { Icon } from "@/components/icons";

/** Shown instead of a crash when a page can't load, e.g. the database is briefly unreachable. */
export function ErrorScreen({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  useEffect(() => {
    // Logged for the developer console; the page itself shows the friendly message.
    console.warn(error);
  }, [error]);
  // Re-fetch the page's server data, then clear the error.
  const retry = () =>
    startTransition(() => {
      router.refresh();
      reset();
    });
  const offline = /database can't be reached|CONNECT_TIMEOUT|ECONN|ETIMEDOUT/i.test(error.message);
  return (
    <div className="mx-auto mt-16 max-w-md text-center" role="alert">
      <span className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-warning-soft text-warning-fg"><Icon name={offline ? "plug" : "alert"} className="size-6" /></span>
      <h1 className="text-lg font-semibold text-fg">{offline ? "Can't reach the database right now" : "This page couldn't load"}</h1>
      <p className="mt-2 text-sm text-muted">
        {offline
          ? "The connection to the CRM's database dropped for a moment. Nothing was lost. Try again; it usually works on the next attempt."
          : "Something went wrong while loading this page. Try again, and if it keeps happening let an admin know."}
      </p>
      <div className="mt-6 flex justify-center gap-2">
        <button type="button" onClick={retry} className="btn-primary"><Icon name="refresh" /> Try again</button>
        <Link href="/" className="btn-secondary">Go to dashboard</Link>
      </div>
      {error.digest && <p className="mt-6 text-xs text-subtle">Reference: {error.digest}</p>}
    </div>
  );
}
