"use client";

import { useState } from "react";
import { ChevronDown, Download, ExternalLink, Link2, Mail, MessageCircle, Share2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { formatMoney, type MoneyFormat } from "@/lib/format";
import { notify } from "@/lib/notify";
import type { PrintFormat } from "@/lib/validations/settings.schema";
import { EmailDialog } from "./email-dialog";

type Props = {
  id: string;
  shareToken: string;
  /** "Quotation", "Invoice", "Draft". */
  kind: string;
  number: string;
  /** Drafts and cancelled documents can be printed but not sent to the customer. */
  shareable: boolean;
  shopName: string;
  customerName: string;
  /** E.164; without it WhatsApp opens so the user can pick the contact. */
  whatsapp: string | null;
  /** Prefilled in "Email to customer". */
  email: string | null;
  /** Invoices with payments can also email a receipt for the latest one. */
  hasPayments: boolean;
  total: number;
  /** Invoices: what is still owed. */
  balance: number | null;
  /** Quotations: formatted "valid until" date. */
  validUntil: string | null;
  money: MoneyFormat;
  /** Shop setting: which file View / Download give, the A4 PDF or the 80mm POS slip. */
  printFormat: PrintFormat;
  disabled?: boolean;
};

/** The customer's view-only link. NEXT_PUBLIC_APP_URL is the deployed address; locally it's this browser's origin. */
function shareUrl(token: string) {
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || window.location.origin;
  return `${base}/share/${token}`;
}

/** View / download in the shop's print format (A4 PDF or POS slip), and sending the document to the customer over WhatsApp, by email or as a link. */
export function ShareMenu(p: Props) {
  const [emailOpen, setEmailOpen] = useState(false);
  const money = (n: number) => formatMoney(n, p.money);
  const file = `/api/documents/${p.id}/${p.printFormat === "pos" ? "receipt" : "pdf"}`;
  const fileName = p.printFormat === "pos" ? "POS Slip" : "PDF";

  const whatsapp = () => {
    const link = shareUrl(p.shareToken);
    const lines = [
      `Assalam-o-Alaikum ${p.customerName},`,
      "",
      `Here is your ${p.kind.toLowerCase()} ${p.number} from ${p.shopName}.`,
      `Total: ${money(p.total)}`,
      p.balance !== null && p.balance > 0 && p.balance < p.total ? `Balance due: ${money(p.balance)}` : null,
      p.balance === 0 ? "Paid in full. Thank you!" : null,
      p.validUntil ? `Valid until: ${p.validUntil}` : null,
      "",
      `View or download it here: ${link}`,
    ].filter((l): l is string => l !== null);
    const text = encodeURIComponent(lines.join("\n"));
    const url = p.whatsapp ? `https://wa.me/${p.whatsapp.replace(/^\+/, "")}?text=${text}` : `https://wa.me/?text=${text}`;
    window.open(url, "_blank", "noopener,noreferrer");
    notify.info(
      "WhatsApp opened",
      p.whatsapp ? `Message for ${p.customerName} is ready; press send in WhatsApp.` : "This customer has no WhatsApp number: pick the contact in WhatsApp.",
    );
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl(p.shareToken));
      notify.success("Link copied", `Anyone with this link can view ${p.kind.toLowerCase()} ${p.number} and download its PDF.`);
    } catch {
      notify.error("Couldn't copy the link", "Your browser blocked the clipboard. Use Share on WhatsApp instead.");
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className="button" disabled={p.disabled}>
            <Share2 size={14} /> Share <ChevronDown size={13} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-auto min-w-52">
          <DropdownMenuItem onSelect={() => window.open(file, "_blank", "noopener,noreferrer")}>
            <ExternalLink size={14} /> View {fileName}
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a href={`${file}?download=1`} download>
              <Download size={14} /> Download {fileName}
            </a>
          </DropdownMenuItem>
          {p.shareable && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={whatsapp}>
                <MessageCircle size={14} /> Share on WhatsApp
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void copyLink()}>
                <Link2 size={14} /> Copy customer link
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setEmailOpen(true)}>
                <Mail size={14} /> Email to customer
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <EmailDialog
        open={emailOpen}
        onOpenChange={setEmailOpen}
        id={p.id}
        kind={p.kind}
        number={p.number}
        customerEmail={p.email}
        canSendReceipt={p.hasPayments}
      />
    </>
  );
}
