"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Ensures the Leads table always displays real-time, up-to-date data:
 * Triggers a refresh on mount (e.g. when navigating back from a lead detail page)
 * and when the window gains focus.
 */
export function LeadsLiveRefresher() {
  const router = useRouter();

  useEffect(() => {
    // Refresh whenever returning to the leads page
    router.refresh();

    const handleFocus = () => {
      router.refresh();
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleFocus);

    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleFocus);
    };
  }, [router]);

  return null;
}

