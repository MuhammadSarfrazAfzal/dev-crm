import type { ActionState } from "@/app/actions/lead";
import { Alert } from "../ui";

export function FormStatus({ state }: { state: ActionState }) {
  if (state.error) return <Alert tone="red">{state.error}</Alert>;
  if (state.ok && state.message) return <Alert tone="green">{state.message}</Alert>;
  return null;
}
