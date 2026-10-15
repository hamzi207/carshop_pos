"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  Ban,
  Car,
  CheckCircle2,
  FileText,
  Loader2,
  ReceiptText,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
} from "lucide-react";
import { deleteDraft, saveQuote, setQuotationStatus, type QuoteActionResult } from "@/lib/actions/quotes";
import {
  isEditable,
  SECTION,
  sectionForStatus,
  STATUS_LABEL,
  STATUS_TONE,
  type DocumentSection,
  type DocumentStage,
} from "@/lib/documents";
import { formatMoney, formatVehicle, type MoneyFormat } from "@/lib/format";
import { quoteTotals, type DiscountType } from "@/lib/quote-math";
import type { FitmentVehicle } from "@/lib/types/inventory";
import type { CustomerOption, PickerItem, PickerItemsResponse, QuoteDocument } from "@/lib/types/quote";
import { quoteSchema, type QuoteInput } from "@/lib/validations/quote.schema";
import { ConfirmDialog, type ConfirmRequest } from "./confirm-dialog";
import { CustomerPicker } from "./customer-picker";
import { ItemPicker } from "./item-picker";
import { LineItems, type BuilderLine } from "./line-items";
import { VehiclePicker } from "./vehicle-picker";

type Props = {
  /** The saved document, or null for a new one. */
  doc: QuoteDocument | null;
  /** The section the page belongs to (decides the main button for new documents). */
  section: DocumentSection;
  /** Worked out on the server so dates render in the shop's timezone. */
  title: string;
  subtitle: string;
  money: MoneyFormat;
  /** Shop's current rate for drafts; issued documents keep their own. */
  taxRate: number;
  /** Tax treatment for new labour lines (shop setting). */
  laborIncludesTax: boolean;
  allowInternationalPhones: boolean;
  terms: string | null;
  /** Pre-selected customer (?customer= from a customer profile). */
  initialCustomer: CustomerOption | null;
};

type Action = {
  key: string;
  label: string;
  icon: ReactNode;
  tone?: "primary" | "danger";
  disabled?: boolean;
  run: () => void;
};

function linesFrom(doc: QuoteDocument | null): BuilderLine[] {
  return (doc?.lines ?? []).map((l) => ({
    key: l.id,
    itemId: l.item_id,
    sku: l.sku,
    description: l.description,
    isLabor: l.is_labor,
    quantity: l.quantity,
    unitPrice: l.unit_price,
    priceIncludesTax: l.price_includes_tax,
    stock: l.quantityOnHand,
  }));
}

/**
 * Next.js keeps visited pages mounted but hidden (Cache Components +
 * <Activity>), so a "new" form would still hold the document it just created
 * when the user comes back to it. Remount the form after each create so it
 * starts blank; unsaved work is still kept if the user simply navigates away.
 */
export function QuoteBuilder(props: Props) {
  const [formKey, setFormKey] = useState(0);
  return <BuilderForm key={formKey} {...props} onCreated={() => setFormKey((k) => k + 1)} />;
}

function BuilderForm({
  doc,
  section,
  title,
  subtitle,
  money,
  taxRate,
  laborIncludesTax,
  allowInternationalPhones,
  terms,
  initialCustomer,
  onCreated,
}: Props & { onCreated: () => void }) {
  const router = useRouter();
  const status = doc?.status ?? null;
  const editable = doc === null || isEditable(doc.status);
  const current: DocumentSection = doc ? sectionForStatus(doc.status) : section;

  const [customer, setCustomer] = useState<CustomerOption | null>(doc?.customer ?? initialCustomer);
  const [vehicle, setVehicle] = useState<FitmentVehicle | null>(doc?.vehicle ?? null);
  const [vehicleNotes, setVehicleNotes] = useState(doc?.custom_vehicle_notes ?? "");
  const [lines, setLines] = useState<BuilderLine[]>(() => linesFrom(doc));
  const [discountType, setDiscountType] = useState<DiscountType>(doc?.discount_type === "percent" ? "percent" : "amount");
  const [discountValue, setDiscountValue] = useState<number>(doc ? Number(doc.discount_value) : 0);
  const [notes, setNotes] = useState(doc?.notes ?? "");
  const [fits, setFits] = useState<PickerItemsResponse["fits"]>(null);

  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);

  const nextKey = useRef(0);
  const newKey = () => `new-${nextKey.current++}`;

  const input: QuoteInput = useMemo(
    () => ({
      customerId: customer?.id ?? "",
      vehicleId: vehicle?.id ?? null,
      customVehicleNotes: vehicleNotes,
      discountType,
      discountValue,
      notes,
      lines: lines.map((l) => ({
        itemId: l.isLabor ? null : l.itemId,
        description: l.description,
        isLabor: l.isLabor,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
      })),
    }),
    [customer, vehicle, vehicleNotes, discountType, discountValue, notes, lines],
  );

  // The builder remounts after each save (keyed by updated_at), so "dirty"
  // means changed since this document was loaded.
  const [savedSnapshot] = useState(() => JSON.stringify(input));
  const dirty = JSON.stringify(input) !== savedSnapshot;

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const totals = quoteTotals(lines, { taxRate, discountType, discountValue });
  const addedIds = useMemo(() => new Set(lines.flatMap((l) => (l.itemId ? [l.itemId] : []))), [lines]);

  const addItem = useCallback((item: PickerItem) => {
    setLines((prev) => {
      const existing = prev.find((l) => l.itemId === item.id && !l.isLabor);
      if (existing) {
        return prev.map((l) => (l === existing ? { ...l, quantity: Math.floor(l.quantity || 0) + 1 } : l));
      }
      return [
        ...prev,
        {
          key: newKey(),
          itemId: item.id,
          sku: item.sku,
          description: item.name,
          isLabor: false,
          quantity: 1,
          unitPrice: item.selling_price,
          priceIncludesTax: item.price_includes_tax,
          stock: item.quantity_on_hand,
        },
      ];
    });
  }, []);

  const addLabor = () =>
    setLines((prev) => [
      ...prev,
      {
        key: newKey(),
        itemId: null,
        sku: null,
        description: "",
        isLabor: true,
        quantity: 1,
        unitPrice: 0,
        priceIncludesTax: laborIncludesTax,
        stock: null,
      },
    ]);

  // ---- Saving and stage changes ---------------------------------------------

  const finish = (result: QuoteActionResult | { status: "success" } | { status: "error"; message: string }, message?: string) => {
    setPending(false);
    setConfirm(null);
    if (result.status === "error") {
      setError(result.message);
      toast.error(result.message);
      return false;
    }
    if (message) toast.success(message);
    return true;
  };

  const save = async (stage: DocumentStage) => {
    setError(null);
    const parsed = quoteSchema.safeParse(input);
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "Check the document and try again.";
      setPending(false);
      setConfirm(null);
      setError(message);
      toast.error(message);
      return;
    }
    if (totals.discountTooLarge) {
      setPending(false);
      setConfirm(null);
      setError("The discount can't be more than the subtotal.");
      return;
    }
    setPending(true);
    const result = await saveQuote(doc?.id ?? null, parsed.data, stage);
    if (result.status !== "success") {
      finish(result);
      return;
    }
    const label = SECTION[result.section].singular;
    const verb = doc && result.section === current ? "saved" : "created";
    finish(result, `${label} ${result.number} ${verb}`);
    if (!doc || result.section !== current) router.replace(`${SECTION[result.section].path}/${result.id}`);
    if (!doc) onCreated();
  };

  const ask = (request: Omit<ConfirmRequest, "onConfirm">, onConfirm: () => Promise<void>) =>
    setConfirm({
      ...request,
      onConfirm: async () => {
        setPending(true);
        await onConfirm();
      },
    });

  const number = doc?.quote_number;
  const unsavedNote = doc && dirty ? " Your unsaved changes are saved first." : "";

  const toQuotation = () =>
    ask(
      {
        title: doc ? `Turn ${number} into a quotation?` : "Create this quotation?",
        icon: <FileText size={18} />,
        confirmLabel: doc ? "Convert to Quotation" : "Create Quotation",
        body: (
          <p>
            It gets the next <strong>Q-</strong> number and moves to Quotations. Quotations can be cancelled but not
            deleted.{unsavedNote}
          </p>
        ),
      },
      () => save("quotation"),
    );

  const toInvoice = () =>
    ask(
      {
        title: doc ? `Turn ${number} into an invoice?` : "Create this invoice?",
        icon: <ReceiptText size={18} />,
        confirmLabel: doc ? "Convert to Invoice" : "Create Invoice",
        body: (
          <p>
            It gets the next <strong>INV-</strong> number and moves to Invoices
            {doc ? `, keeping ${number} as its earlier number` : ""}. Invoices can&apos;t be deleted or turned back.
            {unsavedNote}
          </p>
        ),
      },
      () => save("invoice"),
    );

  const changeQuotation = (next: "accepted" | "cancelled" | "sent", message: string) => async () => {
    if (!doc) return;
    setPending(true);
    finish(await setQuotationStatus(doc.id, next), message);
  };

  const cancelQuotation = () =>
    ask(
      {
        title: `Cancel ${number}?`,
        icon: <Ban size={18} />,
        tone: "danger",
        confirmLabel: "Cancel Quotation",
        body: <p>The quotation stays on record as cancelled and can be re-opened later.</p>,
      },
      changeQuotation("cancelled", `${number} cancelled`),
    );

  const removeDraft = () =>
    ask(
      {
        title: `Delete ${number}?`,
        icon: <Trash2 size={18} />,
        tone: "danger",
        confirmLabel: "Delete Draft",
        body: <p>This draft and its lines will be removed. This can&apos;t be undone.</p>,
      },
      async () => {
        if (!doc) return;
        if (finish(await deleteDraft(doc.id), `${number} deleted`)) router.replace("/drafts");
      },
    );

  const saveIcon = pending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />;
  const actions: Action[] = [];
  if (!doc) {
    actions.push(
      { key: "draft", label: "Save Draft", icon: saveIcon, tone: section === "drafts" ? "primary" : undefined, run: () => void save("draft") },
      { key: "quotation", label: "Save as Quotation", icon: <FileText size={14} />, tone: section === "quotations" ? "primary" : undefined, run: toQuotation },
      { key: "invoice", label: "Create Invoice", icon: <ReceiptText size={14} />, tone: section === "invoices" ? "primary" : undefined, run: toInvoice },
    );
  } else if (status === "draft") {
    actions.push(
      { key: "delete", label: "Delete", icon: <Trash2 size={14} />, tone: "danger", run: removeDraft },
      { key: "save", label: "Save Draft", icon: saveIcon, tone: "primary", disabled: !dirty, run: () => void save("draft") },
      { key: "quotation", label: "Convert to Quotation", icon: <FileText size={14} />, run: toQuotation },
      { key: "invoice", label: "Convert to Invoice", icon: <ReceiptText size={14} />, run: toInvoice },
    );
  } else if (status === "sent" || status === "accepted") {
    actions.push({ key: "cancel", label: "Cancel", icon: <Ban size={14} />, tone: "danger", run: cancelQuotation });
    if (status === "sent") {
      actions.push({
        key: "accept",
        label: "Mark Accepted",
        icon: <CheckCircle2 size={14} />,
        disabled: dirty,
        run: () => void changeQuotation("accepted", `${number} marked accepted`)(),
      });
    }
    actions.push(
      { key: "save", label: "Save Changes", icon: saveIcon, disabled: !dirty, run: () => void save("quotation") },
      { key: "invoice", label: "Convert to Invoice", icon: <ReceiptText size={14} />, tone: "primary", run: toInvoice },
    );
  } else if (status === "cancelled") {
    actions.push({
      key: "reopen",
      label: "Re-open Quotation",
      icon: <RotateCcw size={14} />,
      run: () => void changeQuotation("sent", `${number} re-opened`)(),
    });
  } else if (status === "invoiced") {
    actions.push({ key: "save", label: "Save Changes", icon: saveIcon, tone: "primary", disabled: !dirty, run: () => void save("invoice") });
  }

  const buttonClass = (a: Action) =>
    `button${a.tone === "primary" ? " button-primary" : a.tone === "danger" ? " button-ghost danger" : ""}`;
  const primary = actions.find((a) => a.tone === "primary");

  return (
    <div className="page quote-page">
      <div className="quote-toolbar">
        <div className="quote-title">
          <Link href={SECTION[current].path} className="icon-button" aria-label={`Back to ${SECTION[current].title}`}>
            <ArrowLeft size={16} />
          </Link>
          <div>
            <div className="quote-title-line">
              <h1>{title}</h1>
              {status && <span className={`badge ${STATUS_TONE[status] ?? ""}`}>{STATUS_LABEL[status] ?? status}</span>}
              {dirty && <span className="badge badge-amber">Unsaved changes</span>}
            </div>
            <p>{subtitle}</p>
          </div>
        </div>
        <div className="heading-actions">
          {actions.map((a) => (
            <button key={a.key} type="button" className={buttonClass(a)} disabled={pending || a.disabled} onClick={a.run}>
              {a.icon} {a.label}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="form-alert form-alert-error quote-alert" role="alert">{error}</div>}
      {!editable && (
        <div className="form-alert form-alert-info quote-alert" role="status">
          {status === "paid" ? "This invoice is paid, so it can't be changed." : "This quotation is cancelled. Re-open it to make changes."}
        </div>
      )}
      {status === "invoiced" && (
        <div className="form-alert form-alert-info quote-alert" role="status">
          This invoice has been issued. Changes you save update it in place. Payment and stock deduction arrive in Phase 6.
        </div>
      )}

      <section className="card selector-card">
        <div className="selector-head">
          <div>
            <span className="step-number">1</span>
            <h2>Customer &amp; vehicle</h2>
          </div>
          <span>Choose a customer, then the vehicle for fitment matching (optional for parts-only sales).</span>
        </div>
        <div className="selector-grid">
          <div className="field">
            <span className="field-label">CUSTOMER ACCOUNT</span>
            <CustomerPicker
              value={customer}
              onChange={setCustomer}
              allowInternationalPhones={allowInternationalPhones}
              disabled={!editable}
            />
          </div>
          <VehiclePicker value={vehicle} onChange={setVehicle} disabled={!editable} />
        </div>
        <label className="field vehicle-notes">
          <span className="field-label">TRIM / PACKAGE NOTES (OPTIONAL)</span>
          <input
            className="field-input"
            value={vehicleNotes}
            onChange={(e) => setVehicleNotes(e.target.value)}
            placeholder="e.g. M Sport package, sunroof, customer's own speakers"
            maxLength={200}
            readOnly={!editable}
          />
        </label>
        <div className={`fitment-banner${vehicle ? "" : " muted"}`}>
          <div className="fitment-icon"><Car size={18} /></div>
          <div>
            {vehicle ? (
              <>
                <strong>Vehicle selected: {formatVehicle(vehicle)}</strong>
                <span>
                  {fits
                    ? `Fits ${fits.linked + fits.universal} catalog ${fits.linked + fits.universal === 1 ? "part" : "parts"}: ${fits.linked} made for it, ${fits.universal} universal`
                    : "Checking which parts fit…"}
                </span>
              </>
            ) : (
              <>
                <strong>No vehicle selected</strong>
                <span>All parts are shown. Pick a vehicle to see only parts that fit it.</span>
              </>
            )}
          </div>
          {vehicle && <span className="badge badge-blue"><Sparkles size={12} /> Magic Fit active</span>}
        </div>
      </section>

      <div className="quote-workspace">
        <div className="quote-main">
          {editable && <ItemPicker vehicle={vehicle} money={money} addedIds={addedIds} onAdd={addItem} onFits={setFits} />}
          <LineItems lines={lines} onChange={setLines} onAddLabor={addLabor} money={money} readOnly={!editable} />
        </div>

        <aside className="card summary-card">
          <div className="summary-head">
            <div>
              <span className="step-number">2</span>
              <h2>Order summary</h2>
            </div>
            <span className="badge badge-blue">{money.currency}</span>
          </div>
          {customer && (
            <div className="summary-customer">
              <div>
                <strong>{customer.name}</strong>
                <span>{customer.customer_type}</span>
              </div>
            </div>
          )}
          <div className="summary-lines">
            <div>
              <span>Items subtotal</span>
              <strong>{formatMoney(totals.subtotal, money)}</strong>
            </div>
            <div className="discount-row">
              <span>Discount</span>
              <div>
                <button
                  type="button"
                  className={discountType === "amount" ? "active" : ""}
                  aria-pressed={discountType === "amount"}
                  disabled={!editable}
                  onClick={() => setDiscountType("amount")}
                >
                  {money.currency}
                </button>
                <button
                  type="button"
                  className={discountType === "percent" ? "active" : ""}
                  aria-pressed={discountType === "percent"}
                  disabled={!editable}
                  onClick={() => setDiscountType("percent")}
                >
                  %
                </button>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  max={discountType === "percent" ? 100 : undefined}
                  step="0.01"
                  value={Number.isFinite(discountValue) ? discountValue : ""}
                  onChange={(e) => setDiscountValue(e.target.valueAsNumber)}
                  aria-label={discountType === "percent" ? "Discount percentage" : "Discount amount"}
                  aria-invalid={totals.discountTooLarge || undefined}
                  readOnly={!editable}
                />
              </div>
            </div>
            {totals.discount > 0 && (
              <div>
                <span>Discount applied</span>
                <strong className="discount-amount">−{formatMoney(totals.discount, money)}</strong>
              </div>
            )}
            <div>
              <span>Tax <span className="badge">{taxRate}%</span></span>
              <strong>{taxRate > 0 ? formatMoney(totals.tax, money) : "None"}</strong>
            </div>
          </div>
          <div className="grand-total">
            <div>
              <span>Grand total</span>
              <small>
                {taxRate === 0
                  ? "No tax charged"
                  : totals.addedTax > 0 && totals.includedTax > 0
                    ? `${formatMoney(totals.includedTax, money)} tax in prices + ${formatMoney(totals.addedTax, money)} added`
                    : totals.addedTax > 0
                      ? "Tax added on top"
                      : "Tax included in prices"}
              </small>
            </div>
            <strong>{formatMoney(totals.total, money)}</strong>
          </div>
          {totals.discountTooLarge && <p className="field-error summary-error">The discount is more than the subtotal.</p>}
          <label className="notes-field">
            <span>INTERNAL NOTES (NOT SHOWN TO THE CUSTOMER)</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Fleet pricing approved by the owner."
              maxLength={2000}
              readOnly={!editable}
            />
          </label>
          {terms && (
            <div className="disclaimer">
              <strong>Quote terms</strong>
              <p>{terms}</p>
            </div>
          )}
          {primary && (
            <button type="button" className="button button-primary full-button" disabled={pending || primary.disabled} onClick={primary.run}>
              {primary.icon} {primary.label}
            </button>
          )}
        </aside>
      </div>

      <ConfirmDialog request={confirm} pending={pending} onOpenChange={(open) => !open && setConfirm(null)} />
    </div>
  );
}
