"use client";

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Button, IconButton } from "./primitives";

export function Tabs({
  idPrefix,
  items,
  defaultId,
}: {
  idPrefix: string;
  items: Array<{ id: string; label: string; content: ReactNode }>;
  defaultId?: string;
}) {
  const [activeId, setActiveId] = useState(defaultId ?? items[0]?.id);

  function moveFocus(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex = index;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % items.length;
    if (event.key === "ArrowLeft") nextIndex = (index - 1 + items.length) % items.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = items.length - 1;
    if (nextIndex === index) return;

    event.preventDefault();
    const next = items[nextIndex];
    setActiveId(next.id);
    document.getElementById(`${idPrefix}-tab-${next.id}`)?.focus();
  }

  return (
    <div className="ui-tabs">
      <div className="ui-tabs__list" role="tablist" aria-label="Component state examples">
        {items.map((item, index) => {
          const active = item.id === activeId;
          return (
            <button
              id={`${idPrefix}-tab-${item.id}`}
              className="ui-tabs__tab"
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={`${idPrefix}-panel-${item.id}`}
              tabIndex={active ? 0 : -1}
              key={item.id}
              onClick={() => setActiveId(item.id)}
              onKeyDown={(event) => moveFocus(event, index)}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      {items.map((item) => (
        <div
          id={`${idPrefix}-panel-${item.id}`}
          className="ui-tabs__panel"
          role="tabpanel"
          aria-labelledby={`${idPrefix}-tab-${item.id}`}
          hidden={item.id !== activeId}
          key={item.id}
        >
          {item.content}
        </div>
      ))}
    </div>
  );
}

function useDialogState(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const handleClose = () => onClose();
    dialog.addEventListener("close", handleClose);
    return () => dialog.removeEventListener("close", handleClose);
  }, [onClose]);

  return ref;
}

export function Dialog({
  open,
  title,
  description,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  description: string;
  onClose: () => void;
  children?: ReactNode;
}) {
  const ref = useDialogState(open, onClose);
  return (
    <dialog
      ref={ref}
      className="ui-dialog"
      aria-labelledby="catalogue-dialog-title"
      aria-describedby="catalogue-dialog-description"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="ui-dialog__header">
        <div>
          <span className="eyebrow">Confirmation</span>
          <h2 id="catalogue-dialog-title">{title}</h2>
        </div>
        <IconButton label="Close dialog" icon="×" variant="quiet" onClick={onClose} />
      </div>
      <p id="catalogue-dialog-description" className="muted-copy">
        {description}
      </p>
      {children}
      <div className="ui-dialog__actions">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={onClose}>Confirm</Button>
      </div>
    </dialog>
  );
}

export function Drawer({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children?: ReactNode;
}) {
  const ref = useDialogState(open, onClose);
  return (
    <dialog
      ref={ref}
      className="ui-drawer"
      aria-labelledby="catalogue-drawer-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="ui-dialog__header">
        <h2 id="catalogue-drawer-title">{title}</h2>
        <IconButton label="Close drawer" icon="×" variant="quiet" onClick={onClose} />
      </div>
      {children}
    </dialog>
  );
}

export function Menu({
  label,
  items,
}: {
  label: string;
  items: Array<{ label: string; onSelect: () => void; danger?: boolean }>;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  return (
    <div className="ui-menu" ref={rootRef}>
      <Button
        variant="secondary"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
      >
        {label}
      </Button>
      {open ? (
        <div className="ui-menu__panel" role="menu">
          {items.map((item) => (
            <button
              className={item.danger ? "ui-menu__item ui-menu__item--danger" : "ui-menu__item"}
              type="button"
              role="menuitem"
              key={item.label}
              onClick={() => {
                item.onSelect();
                setOpen(false);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function Toast({
  visible,
  title,
  message,
  onDismiss,
}: {
  visible: boolean;
  title: string;
  message: string;
  onDismiss: () => void;
}) {
  if (!visible) return null;
  return (
    <div className="ui-toast" role="status" aria-live="polite">
      <div>
        <strong>{title}</strong>
        <p>{message}</p>
      </div>
      <IconButton label="Dismiss notification" icon="×" variant="quiet" onClick={onDismiss} />
    </div>
  );
}
