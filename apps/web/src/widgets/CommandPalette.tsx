import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Search } from "lucide-react";

export interface CommandItem {
  label: string;
  hint?: string;
  group: string;
  to: string;
  icon: ReactNode;
}

export function CommandPalette({
  open,
  items,
  onClose,
  onSelect,
}: {
  open: boolean;
  items: CommandItem[];
  onClose: () => void;
  onSelect: (path: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle === "") {
      return items;
    }
    return items.filter((item) => {
      const haystack = `${item.label} ${item.group} ${item.hint ?? ""}`.toLowerCase();
      return haystack.includes(needle);
    });
  }, [items, query]);

  useEffect(() => {
    if (!open) {
      return;
    }
    setQuery("");
    setActiveIndex(0);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.clearTimeout(timer);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (activeIndex >= filtered.length) {
      setActiveIndex(Math.max(0, filtered.length - 1));
    }
  }, [activeIndex, filtered.length]);

  useEffect(() => {
    if (!open) {
      return;
    }
    document.getElementById(`command-item-${activeIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  if (!open) {
    return null;
  }

  const groups = [...new Set(filtered.map((item) => item.group))].map((group) => ({
    group,
    items: filtered.filter((item) => item.group === group),
  }));

  const select = (item: CommandItem | undefined) => {
    if (item === undefined) {
      return;
    }
    onClose();
    onSelect(item.to);
  };

  return createPortal(
    <div
      className="command-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="command-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Pencarian dan aksi cepat"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="command-input-wrap">
          <Search size={17} aria-hidden="true" />
          <input
            ref={inputRef}
            className="command-input"
            type="text"
            value={query}
            placeholder="Cari halaman atau aksi"
            aria-label="Cari halaman atau aksi"
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActiveIndex((current) =>
                  filtered.length === 0 ? 0 : (current + 1) % filtered.length,
                );
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setActiveIndex((current) =>
                  filtered.length === 0 ? 0 : (current - 1 + filtered.length) % filtered.length,
                );
              }
              if (event.key === "Enter") {
                event.preventDefault();
                select(filtered[activeIndex]);
              }
              if (event.key === "Escape") {
                event.preventDefault();
                onClose();
              }
            }}
          />
          <kbd className="command-kbd">Esc</kbd>
        </div>

        <div className="command-list">
          {filtered.length === 0 ? (
            <div className="command-empty">Tidak ada halaman atau aksi yang cocok.</div>
          ) : (
            groups.map((group) => (
              <div key={group.group}>
                <div className="command-group-label">{group.group}</div>
                {group.items.map((item) => {
                  const index = filtered.indexOf(item);
                  return (
                    <button
                      key={`${item.group}-${item.to}-${item.label}`}
                      id={`command-item-${index}`}
                      type="button"
                      className="command-item"
                      aria-current={index === activeIndex ? "true" : undefined}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => select(item)}
                    >
                      <span className="command-item__icon" aria-hidden="true">
                        {item.icon}
                      </span>
                      <span className="command-item__copy">
                        <strong>{item.label}</strong>
                        {item.hint === undefined ? null : <small>{item.hint}</small>}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="command-footer">
          <span>↑↓ navigasi</span>
          <span>Enter buka</span>
          <span>Esc tutup</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
