"use client";

import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../icons";
import { cn } from "../ui";
import { arrowNavigate, usePopover } from "./usePopover";

export type DropdownOption = { value: string; label: string; disabled?: boolean; hint?: string };

/**
 * Drop-in replacement for a native <select>: same submitted value (a hidden input with
 * `name`), works inside forms and server actions, but the list is an in-page menu so it
 * can't flicker shut. Keyboard: Enter/Space/ArrowDown open, arrows move, Enter picks,
 * Escape closes.
 */
export function Dropdown({
  id,
  name,
  options,
  value: controlled,
  defaultValue,
  onChange,
  placeholder = "Choose…",
  required,
  disabled,
  className,
  ariaLabel,
  testId,
}: {
  id?: string;
  name?: string;
  options: DropdownOption[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
  testId?: string;
}) {
  const auto = useId();
  const buttonId = id ?? `dd-${auto}`;
  const [inner, setInner] = useState(defaultValue ?? "");
  const value = controlled ?? inner;
  const selected = options.find((o) => o.value === value);
  const { open, setOpen, trigger, panel, style, placement } = usePopover();
  const [mounted, setMounted] = useState(false);
  // Portals need the document; render the menu only after mounting on the client.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const current = panel.current?.querySelector<HTMLElement>('[aria-selected="true"]') ?? panel.current?.querySelector<HTMLElement>("[role=option]:not([aria-disabled])");
    current?.focus();
    current?.scrollIntoView({ block: "nearest" });
  }, [open, panel]);

  function pick(v: string) {
    if (controlled === undefined) setInner(v);
    onChange?.(v);
    setOpen(false);
    trigger.current?.focus();
    // Let forms that listen for changes (e.g. counters) hear about it.
    trigger.current?.form?.dispatchEvent(new Event("change", { bubbles: true }));
  }

  return (
    <>
      {name && <input type="hidden" name={name} value={value} />}
      {required && (
        // Native "please fill in" check for required choices.
        <input tabIndex={-1} aria-hidden required value={value} onChange={() => {}} className="pointer-events-none absolute h-0 w-0 opacity-0" />
      )}
      <button
        ref={trigger}
        id={buttonId}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        data-testid={testId}
        data-value={value}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={cn("input flex items-center justify-between gap-2 text-left", !selected && "text-subtle", className)}
      >
        <span className="truncate">{selected?.label ?? placeholder}</span>
        <Icon name="chevronDown" className={cn("size-4 shrink-0 text-muted transition", open && "rotate-180")} />
      </button>
      {mounted && open &&
        createPortal(
          <div
            ref={panel}
            role="listbox"
            aria-labelledby={buttonId}
            onKeyDown={(e) => arrowNavigate(e, panel.current)}
            style={style}
            data-placement={placement}
            data-testid={testId ? `${testId}-menu` : undefined}
            className="z-[60] overflow-y-auto rounded-lg border border-line bg-surface p-1 text-sm shadow-pop"
          >
            {options.map((o) => (
              <div
                key={o.value}
                role="option"
                tabIndex={-1}
                aria-selected={o.value === value}
                aria-disabled={o.disabled || undefined}
                onClick={() => !o.disabled && pick(o.value)}
                onKeyDown={(e) => {
                  if ((e.key === "Enter" || e.key === " ") && !o.disabled) {
                    e.preventDefault();
                    pick(o.value);
                  }
                }}
                className={cn(
                  "flex cursor-pointer items-center justify-between gap-2 rounded-md px-2.5 py-1.5 outline-none",
                  o.disabled ? "cursor-default text-subtle" : "text-fg-2 hover:bg-surface-2 focus:bg-surface-2",
                  o.value === value && "font-medium text-brand-fg",
                )}
              >
                <span className="min-w-0 truncate">{o.label}</span>
                {o.value === value ? <Icon name="check" className="size-3.5 shrink-0" /> : o.hint ? <span className="shrink-0 text-xs text-subtle">{o.hint}</span> : null}
              </div>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
