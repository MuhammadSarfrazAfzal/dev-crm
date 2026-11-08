"use client";

import { useActionState } from "react";
import { updateUser } from "@/app/actions/team";
import type { ActionState } from "@/app/actions/lead";
import { Dropdown } from "@/components/menu/Dropdown";
import { DeleteUserButton } from "./DeleteUserButton";
import { FormStatus } from "@/components/lead/FormStatus";

export type TeamUserData = {
  id: string;
  email: string;
  full_name: string;
  role: "admin" | "salesperson";
  active: boolean;
};

export function UserRowActions({
  user,
  adminId,
}: {
  user: TeamUserData;
  adminId: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(updateUser, {});

  return (
    <div className="flex flex-col gap-2 sm:items-end">
      <form action={formAction} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="userId" value={user.id} />

        {/* 1. Role Button / Dropdown */}
        <div className="w-32">
          <Dropdown
            name="role"
            defaultValue={user.role}
            className="h-9 w-full px-3 text-xs font-medium"
            ariaLabel={`Role for ${user.full_name}`}
            options={[
              { value: "salesperson", label: "Salesperson" },
              { value: "admin", label: "Admin" },
            ]}
          />
        </div>

        {/* 2. Status Button / Dropdown */}
        <div className="w-32">
          <Dropdown
            name="active"
            defaultValue={String(user.active)}
            className="h-9 w-full px-3 text-xs font-medium"
            ariaLabel={`Status for ${user.full_name}`}
            options={[
              { value: "true", label: "Active" },
              { value: "false", label: "Deactivated" },
            ]}
          />
        </div>

        {/* 3 & 4. Save and Delete Buttons - locked together in the same row */}
        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={pending}
            className="btn-secondary h-9 w-32 justify-center px-3 text-xs font-medium"
          >
            {pending ? "Saving…" : "Save"}
          </button>

          <DeleteUserButton
            userId={user.id}
            name={user.full_name}
            email={user.email}
            isSelf={user.id === adminId}
            className="h-9 w-32 justify-center px-3 text-xs font-medium"
          />
        </div>
      </form>

      <FormStatus state={state} />
    </div>
  );
}

