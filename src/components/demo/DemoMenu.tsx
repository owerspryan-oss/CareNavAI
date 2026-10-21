"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import styles from "./DemoMenu.module.css";

export interface DemoMenuItem {
  id: string;
  label: string;
  onSelect: () => void;
}

/**
 * Demo mode (FR-26, AC-26.1): a presenter-only menu, hidden until Alt+Shift+D, that loads the fictional
 * demo inputs so a recording can be repeated. Rendered only when the server passes presets (DEMO_MODE=true).
 * Presenter-facing English, not interface copy, so it isn't localised.
 */
export function DemoMenu({ items }: { items: DemoMenuItem[] }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // e.code, so it works whatever Alt+Shift+D types on the keyboard layout.
      if (e.altKey && e.shiftKey && e.code === "KeyD") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!open || items.length === 0) return null;
  return (
    <div className={styles.menu} role="dialog" aria-label="Demo inputs" data-demo-menu>
      <p className={styles.heading}>Demo inputs (fictional)</p>
      {items.map((item) => (
        <Button
          key={item.id}
          variant="tertiary"
          fullWidth
          data-demo={item.id}
          onClick={() => {
            setOpen(false);
            item.onSelect();
          }}
        >
          {item.label}
        </Button>
      ))}
      <Button variant="link" onClick={() => setOpen(false)}>
        Close
      </Button>
    </div>
  );
}
