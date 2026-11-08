"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { markWhatsAppDone, reopenWhatsApp } from "@/app/actions/lead";
import { notifyLiveChange } from "@/components/LiveUpdates";
import { Icon } from "@/components/icons";

export function WhatsAppDoneButton({
  leadId,
  followupId,
  callId,
}: {
  leadId: string;
  followupId?: string | null;
  callId?: string | null;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleDone = () => {
    const formData = new FormData();
    formData.append("leadId", leadId);
    if (followupId) formData.append("followupId", followupId);
    if (callId) formData.append("callId", callId);

    startTransition(async () => {
      await markWhatsAppDone(formData);
      notifyLiveChange();
      router.refresh();
    });
  };

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={handleDone}
      className="btn-secondary btn-sm inline-flex items-center gap-1 font-medium disabled:opacity-50"
      title="Mark as completed"
    >
      {isPending ? (
        <>
          <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
          Done
        </>
      ) : (
        <>
          <Icon name="check" className="size-3.5 text-success-fg" /> Done
        </>
      )}
    </button>
  );
}

export function WhatsAppReopenButton({
  leadId,
  followupId,
}: {
  leadId: string;
  followupId?: string | null;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleReopen = () => {
    const formData = new FormData();
    formData.append("leadId", leadId);
    if (followupId) formData.append("followupId", followupId);

    startTransition(async () => {
      await reopenWhatsApp(formData);
      notifyLiveChange();
      router.refresh();
    });
  };

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={handleReopen}
      className="btn-ghost btn-sm inline-flex items-center gap-1 text-xs text-muted hover:text-fg disabled:opacity-50"
      title="Move back to To Send"
    >
      {isPending ? (
        <span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : (
        <Icon name="history" className="size-3" />
      )}
      Reopen
    </button>
  );
}
