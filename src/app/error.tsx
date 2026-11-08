"use client";

import { ErrorScreen } from "@/components/ErrorScreen";

/** The app shell itself failed (e.g. the signed-in user couldn't be loaded): full-page message. */
export default function RootError(props: Parameters<typeof ErrorScreen>[0]) {
  return (
    <main className="min-h-dvh px-4 py-10">
      <ErrorScreen {...props} />
    </main>
  );
}
