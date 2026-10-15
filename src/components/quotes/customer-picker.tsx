"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Banknote, Loader2, Search, UserPlus, Users, X } from "lucide-react";
import { formatPhone } from "@/lib/phone";
import type { CustomerOption, CustomerOptionsResponse } from "@/lib/types/quote";
import { CustomerAvatar, CustomerTypeBadge } from "@/components/customers/customer-badges";
import { CustomerDialog } from "@/components/customers/customer-dialog";

type Props = {
  value: CustomerOption | null;
  onChange: (customer: CustomerOption | null) => void;
  allowInternationalPhones: boolean;
  /** The shop's walk-in / cash customer, for the quick-select button. */
  walkIn: CustomerOption | null;
  disabled?: boolean;
};

async function fetchCustomers(params: string, signal?: AbortSignal) {
  const res = await fetch(`/api/customers${params}`, { signal });
  if (!res.ok) throw new Error("Couldn't load customers.");
  return ((await res.json()) as CustomerOptionsResponse).customers;
}

/** Searchable customer combobox, with "register new customer" in a modal. */
export function CustomerPicker({ value, onChange, allowInternationalPhones, walkIn, disabled }: Props) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<CustomerOption[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);

  useEffect(() => {
    if (!open) return;
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      setError(null);
      const q = query.trim();
      fetchCustomers(q ? `?q=${encodeURIComponent(q)}` : "", ctrl.signal)
        .then((rows) => {
          setResults(rows);
          setActive(0);
        })
        .catch((err) => !ctrl.signal.aborted && setError(err.message))
        .finally(() => !ctrl.signal.aborted && setLoading(false));
    }, 200);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [open, query]);

  const choose = (customer: CustomerOption) => {
    onChange(customer);
    setOpen(false);
    setQuery("");
  };

  const onRegistered = async (id: string) => {
    try {
      const [customer] = await fetchCustomers(`?id=${id}`);
      if (customer) choose(customer);
    } catch {
      setError("Customer saved, but couldn't be selected. Search for them by name.");
    }
  };

  if (value) {
    return (
      <div className="customer-picked">
        <CustomerAvatar name={value.name} />
        <div>
          <strong>{value.name}</strong>
          <span>
            {value.is_walk_in ? (
              "Cash sale · add the buyer's details below if you like"
            ) : (
              <>
                <CustomerTypeBadge type={value.customer_type} /> {formatPhone(value.whatsapp_number)}
                {Number(value.default_discount_percentage) > 0 && ` · ${Number(value.default_discount_percentage)}% default discount`}
              </>
            )}
          </span>
        </div>
        {!disabled && (
          <button
            type="button"
            className="icon-button"
            aria-label="Change customer"
            title="Change customer"
            onClick={() => {
              onChange(null);
              requestAnimationFrame(() => inputRef.current?.focus());
            }}
          >
            <X size={15} />
          </button>
        )}
      </div>
    );
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && open && results[active]) {
      e.preventDefault();
      choose(results[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className="customer-combobox">
      <div className="customer-combobox-row">
      <div className="field-control">
        {loading ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
        <input
          ref={inputRef}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && results[active] ? `${listId}-${results[active].id}` : undefined}
          aria-label="Customer"
          placeholder="Search customers by name, phone or NTN…"
          value={query}
          disabled={disabled}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={onKeyDown}
          maxLength={100}
        />
      </div>
      {walkIn && (
        <button
          type="button"
          className="button walk-in-button"
          disabled={disabled}
          onClick={() => choose(walkIn)}
          title="Bill a walk-in / cash customer without creating a profile"
        >
          <Banknote size={14} /> Walk-in / Cash
        </button>
      )}
      </div>
      {open && (
        <div className="combobox-menu">
          <ul id={listId} role="listbox" aria-label="Customers">
            {results.map((c, i) => (
              <li
                key={c.id}
                id={`${listId}-${c.id}`}
                role="option"
                aria-selected={i === active}
                className={i === active ? "active" : ""}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(c)}
              >
                <CustomerAvatar name={c.name} />
                <div>
                  <strong>{c.name}</strong>
                  <span>{c.customer_type} · {formatPhone(c.whatsapp_number)}</span>
                </div>
              </li>
            ))}
          </ul>
          {!loading && results.length === 0 && (
            <div className="combobox-empty">
              <Users size={15} /> {error ?? (query.trim() ? "No customers match." : "No customers yet.")}
            </div>
          )}
          <button
            type="button"
            className="combobox-add"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setOpen(false);
              setRegistering(true);
            }}
          >
            <UserPlus size={14} /> Register a new customer
          </button>
        </div>
      )}
      {error && !open && <span className="field-error">{error}</span>}
      <CustomerDialog
        open={registering}
        onOpenChange={setRegistering}
        allowInternationalPhones={allowInternationalPhones}
        onSaved={(id) => void onRegistered(id)}
      />
    </div>
  );
}
