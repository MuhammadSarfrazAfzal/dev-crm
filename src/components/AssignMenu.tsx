"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ConfirmDialog } from "./ConfirmDialog";
import { DeleteButton } from "./DeleteButton";
import { Icon } from "./icons";
import { cn } from "./ui";

type Owner = { id: string; full_name: string };
type Place = { top: number; left: number; up: boolean };

const MENU_WIDTH = 224;
const GAP = 4;

/**
 * "Assign selected to" for the leads list: a button that opens a menu right under it
 * (flipping up only when there's no room below) and submits the surrounding form with the
 * chosen owner. Built as an in-page menu rather than a native <select>, whose popup some
 * desktops close the moment it opens.
 */
export function AssignMenu({ owners }: { owners: Owner[] }) {
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState<Place | null>(null);
  const [selected, setSelected] = useState(0);
  const [totalOnPage, setTotalOnPage] = useState(0);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  // Count ticked leads in the surrounding form so the button can say how many will move.
  useEffect(() => {
    const form = button.current?.form;
    if (!form) return;
    const count = () => {
      const all = Array.from(form.querySelectorAll<HTMLInputElement>('tbody input[name="ids"], ul input[name="ids"]'));
      setTotalOnPage(all.length);
      setSelected(all.filter((c) => c.checked).length);
    };
    count();
    form.addEventListener("change", count);
    return () => form.removeEventListener("change", count);
  }, []);

  function selectAllOnPage() {
    const form = button.current?.form;
    if (!form) return;
    const all = form.querySelectorAll<HTMLInputElement>('input[name="ids"]');
    all.forEach((c) => (c.checked = true));
    form.dispatchEvent(new Event("change", { bubbles: true }));
  }

  const position = useCallback(() => {
    const b = button.current?.getBoundingClientRect();
    if (!b) return;
    const height = menu.current?.offsetHeight ?? 0;
    const roomBelow = window.innerHeight - b.bottom - GAP;
    const up = height > 0 && roomBelow < height && b.top - GAP > roomBelow;
    const left = Math.min(Math.max(8, b.right - MENU_WIDTH), window.innerWidth - MENU_WIDTH - 8);
    setPlace({ top: up ? b.top - GAP - height : b.bottom + GAP, left, up });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    position();
    menu.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, [open, position]);

  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!menu.current?.contains(e.target as Node) && !button.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", key);
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", key);
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [open, position]);

  // Picking someone asks first; the form is submitted only after "Assign".
  const [pick, setPick] = useState<{ id: string; name: string } | null>(null);
  function choose(ownerId: string) {
    setOpen(false);
    setPick({ id: ownerId, name: ownerId === "none" ? "nobody (unassigned)" : owners.find((o) => o.id === ownerId)?.full_name ?? "this person" });
  }
  const cancelAssign = useCallback(() => setPick(null), []);
  function confirmAssign() {
    if (!pick) return;
    if (input.current) input.current.value = pick.id;
    setPick(null);
    button.current?.form?.requestSubmit();
  }

  function onMenuKey(e: React.KeyboardEvent) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = [...(menu.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    items[(i + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length]?.focus();
  }

  function clearSelection() {
    const form = button.current?.form;
    if (!form) return;
    const all = form.querySelectorAll<HTMLInputElement>('input[name="ids"]');
    all.forEach((c) => (c.checked = false));
    form.dispatchEvent(new Event("change", { bubbles: true }));
    setSelected(0);
    setOpen(false);
  }

  return (
    <>
      <input ref={input} type="hidden" name="owner" defaultValue="" />
      <div className={cn("flex items-center gap-2 text-sm", selected === 0 && "hidden")} data-testid="selection-bar">
        <span className="font-medium text-fg tabular-nums">{selected} selected</span>
        <span className="text-subtle" aria-hidden>·</span>
        {selected < totalOnPage ? (
          <>
            <button
              type="button"
              onClick={selectAllOnPage}
              className="btn-ghost btn-sm text-brand-fg hover:bg-brand-soft"
              data-testid="select-all-page"
            >
              Select all {totalOnPage} on page
            </button>
            <span className="text-subtle" aria-hidden>·</span>
          </>
        ) : (
          <>
            <span className="text-xs text-muted">All {totalOnPage} on page selected</span>
            <span className="text-subtle" aria-hidden>·</span>
          </>
        )}
        <button
          ref={button}
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          className="btn-secondary btn-sm"
          data-testid="assign-button"
        >
          Assign to
          <Icon name="chevronDown" className={cn("size-3.5 transition", open && "rotate-180")} />
        </button>
        <DeleteButton
          kind="leads"
          variant="bar"
          testId="delete-selected"
          getIds={() => [...(button.current?.form?.querySelectorAll<HTMLInputElement>('tbody input[name="ids"]:checked, ul input[name="ids"]:checked') ?? [])].map((c) => c.value)}
        />
        <button type="button" onClick={clearSelection} className="btn-ghost btn-sm">Clear</button>
      </div>
      {open && (
        <div
          ref={menu}
          role="menu"
          aria-label="Assign to"
          onKeyDown={onMenuKey}
          style={{ position: "fixed", top: place?.top ?? -9999, left: place?.left ?? -9999, width: MENU_WIDTH }}
          className="z-50 max-h-72 overflow-y-auto rounded-lg border border-line bg-surface p-1.5 shadow-pop"
          data-testid="assign-menu"
          data-placement={place?.up ? "up" : "down"}
        >
          <div className="px-2 py-1 text-[11px] font-medium text-subtle">Give {selected} lead{selected === 1 ? "" : "s"} to</div>
          {owners.map((o) => (
            <button key={o.id} type="button" role="menuitem" onClick={() => choose(o.id)} className="w-full rounded-md px-2 py-1.5 text-left text-sm text-fg-2 hover:bg-surface-2 focus:bg-surface-2 focus:outline-none">
              {o.full_name}
            </button>
          ))}
          <div className="my-1 border-t border-line" />
          <button type="button" role="menuitem" onClick={() => choose("none")} className="w-full rounded-md px-2 py-1.5 text-left text-sm text-muted hover:bg-surface-2 focus:bg-surface-2 focus:outline-none">
            Unassigned
          </button>
        </div>
      )}
      {pick && (
        <ConfirmDialog
          testId="assign-dialog"
          icon="users"
          title={pick.id === "none" ? `Unassign ${selected} lead${selected === 1 ? "" : "s"}?` : `Assign ${selected} lead${selected === 1 ? "" : "s"} to ${pick.name}?`}
          body={pick.id === "none" ? "They'll have no owner until you give them to someone." : `${pick.name} becomes the owner and gets their pending follow-ups.`}
          confirmLabel={pick.id === "none" ? "Unassign" : "Assign"}
          onConfirm={confirmAssign}
          onCancel={cancelAssign}
        />
      )}
    </>
  );
}
