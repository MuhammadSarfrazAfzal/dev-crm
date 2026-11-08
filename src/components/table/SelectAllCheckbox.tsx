"use client";

import { useEffect, useRef } from "react";

export function SelectAllCheckbox({
  name = "ids",
  className,
  ariaLabel = "Select all on this page",
}: {
  name?: string;
  className?: string;
  ariaLabel?: string;
}) {
  const checkboxRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const cb = checkboxRef.current;
    if (!cb) return;
    const form = cb.form ?? cb.closest("form") ?? cb.closest("table");
    if (!form) return;

    function syncState() {
      if (!cb) return;
      const all = Array.from(
        form!.querySelectorAll<HTMLInputElement>(`tbody input[name="${name}"], ul input[name="${name}"]`)
      );
      const total = all.length;
      const checked = all.filter((el) => el.checked).length;

      if (total === 0) {
        cb.checked = false;
        cb.indeterminate = false;
      } else if (checked === total) {
        cb.checked = true;
        cb.indeterminate = false;
      } else if (checked > 0) {
        cb.checked = false;
        cb.indeterminate = true;
      } else {
        cb.checked = false;
        cb.indeterminate = false;
      }
    }

    syncState();
    form.addEventListener("change", syncState);
    return () => form.removeEventListener("change", syncState);
  }, [name]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const cb = checkboxRef.current;
    if (!cb) return;
    const form = cb.form ?? cb.closest("form") ?? cb.closest("table");
    if (!form) return;

    const shouldCheck = e.target.checked;
    const all = Array.from(
      form.querySelectorAll<HTMLInputElement>(`tbody input[name="${name}"], ul input[name="${name}"]`)
    );

    all.forEach((item) => {
      item.checked = shouldCheck;
    });

    form.dispatchEvent(new Event("change", { bubbles: true }));
  }

  return (
    <input
      ref={checkboxRef}
      type="checkbox"
      aria-label={ariaLabel}
      title={ariaLabel}
      onChange={handleChange}
      className={`size-4 align-middle cursor-pointer ${className ?? ""}`}
    />
  );
}
