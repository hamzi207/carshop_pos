import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { billingDate, payToLines, pkr, CYCLE_LABEL, INVOICE_STATUS, badgeOf, type BillingCycle, type PayTo } from "@/lib/subscription";
import { FONT, FONT_BOLD } from "./fonts";

// ProductLogik's subscription invoice to an organization (Phase 17, deliverable 9): the platform's
// business details, the period and lines, and where to pay with the invoice number as the reference.

const INK = "#0f172a";
const MUTED = "#64748b";
const LINE = "#e2e8f0";
const SOFT = "#f8fafc";
const DANGER = "#be123c";
const PAID = "#0f766e";

const s = StyleSheet.create({
  page: { padding: 36, paddingBottom: 56, fontSize: 9, color: INK, fontFamily: FONT },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingBottom: 14, borderBottomWidth: 2, borderBottomColor: INK },
  seller: { width: "58%" },
  name: { fontSize: 15, fontFamily: FONT_BOLD, marginBottom: 3 },
  small: { fontSize: 8.5, color: MUTED, lineHeight: 1.45 },
  titleBlock: { alignItems: "flex-end" },
  title: { fontSize: 20, fontFamily: FONT_BOLD, letterSpacing: 1.2 },
  number: { fontSize: 11, fontFamily: FONT_BOLD, marginTop: 4 },
  status: { marginTop: 6, fontSize: 8, fontFamily: FONT_BOLD, paddingVertical: 3, paddingHorizontal: 7, borderRadius: 3, color: "#ffffff" },
  meta: { flexDirection: "row", justifyContent: "space-between", marginTop: 16, marginBottom: 16 },
  box: { width: "56%", padding: 10, backgroundColor: SOFT, borderRadius: 4, borderWidth: 1, borderColor: LINE },
  label: { fontSize: 7, fontFamily: FONT_BOLD, color: MUTED, letterSpacing: 0.8, marginBottom: 4 },
  strong: { fontSize: 10.5, fontFamily: FONT_BOLD, marginBottom: 2 },
  dates: { width: "38%" },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: LINE },
  th: { flexDirection: "row", backgroundColor: INK, color: "#ffffff", paddingVertical: 6, paddingHorizontal: 6, fontSize: 7.5, fontFamily: FONT_BOLD, letterSpacing: 0.5 },
  tr: { flexDirection: "row", paddingVertical: 6, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: LINE },
  cDesc: { width: "75%", paddingRight: 6 },
  cAmt: { width: "25%", textAlign: "right" },
  totals: { marginTop: 12, marginLeft: "auto", width: "42%" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3.5 },
  grand: { flexDirection: "row", justifyContent: "space-between", marginTop: 4, paddingVertical: 7, paddingHorizontal: 8, backgroundColor: INK, color: "#ffffff", borderRadius: 3 },
  grandText: { fontSize: 11.5, fontFamily: FONT_BOLD },
  balance: { flexDirection: "row", justifyContent: "space-between", marginTop: 4, paddingVertical: 6, paddingHorizontal: 8, borderWidth: 1.5, borderColor: DANGER, borderRadius: 3 },
  pay: { marginTop: 20, padding: 10, borderWidth: 1, borderColor: LINE, borderLeftWidth: 3, borderLeftColor: INK, borderRadius: 4, backgroundColor: SOFT },
  payLine: { fontSize: 9.5, fontFamily: FONT_BOLD, marginTop: 3 },
  footer: { position: "absolute", left: 36, right: 36, bottom: 24, flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: MUTED },
});

export type SubscriptionInvoicePdfData = {
  seller: { name: string; address: string | null; phone: string | null; email: string | null; ntn: string | null };
  buyer: { name: string; address: string | null; phone: string | null; email: string | null; ntn: string | null };
  invoice: {
    number: string;
    planName: string;
    cycle: BillingCycle;
    periodStart: string;
    periodEnd: string;
    issueDate: string;
    dueDate: string;
    total: number;
    amountPaid: number;
    status: string;
  };
  lines: { kind: string; description: string; amount: number }[];
  payTo: PayTo;
};

const contact = (p: SubscriptionInvoicePdfData["seller"]) =>
  [p.address, [p.phone, p.email].filter(Boolean).join(" · "), p.ntn ? `NTN ${p.ntn}` : null].filter(Boolean) as string[];

const money = (n: number) => (n < 0 ? `-${pkr(-n)}` : pkr(n));

export function SubscriptionInvoicePdf({ data }: { data: SubscriptionInvoicePdfData }) {
  const { seller, buyer, invoice: i, lines, payTo } = data;
  const status = badgeOf(INVOICE_STATUS, i.status);
  const balance = i.total - i.amountPaid;
  const statusColour = i.status === "paid" ? PAID : i.status === "void" ? MUTED : DANGER;
  const pay = payToLines(payTo);
  return (
    <Document title={`Invoice ${i.number}`} author={seller.name}>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <View style={s.seller}>
            <Text style={s.name}>{seller.name}</Text>
            {contact(seller).map((l) => <Text key={l} style={s.small}>{l}</Text>)}
          </View>
          <View style={s.titleBlock}>
            <Text style={s.title}>INVOICE</Text>
            <Text style={s.number}>{i.number}</Text>
            <Text style={[s.status, { backgroundColor: statusColour }]}>{status.label.toUpperCase()}</Text>
          </View>
        </View>

        <View style={s.meta}>
          <View style={s.box}>
            <Text style={s.label}>BILL TO</Text>
            <Text style={s.strong}>{buyer.name}</Text>
            {contact(buyer).map((l) => <Text key={l} style={s.small}>{l}</Text>)}
          </View>
          <View style={s.dates}>
            <View style={s.row}><Text>Issued</Text><Text>{billingDate(i.issueDate)}</Text></View>
            <View style={s.row}><Text>Due</Text><Text style={{ fontFamily: FONT_BOLD }}>{billingDate(i.dueDate)}</Text></View>
            <View style={s.row}><Text>Plan</Text><Text>{i.planName} · {CYCLE_LABEL[i.cycle]}</Text></View>
            <View style={s.row}><Text>Period</Text><Text>{billingDate(i.periodStart)} – {billingDate(i.periodEnd)}</Text></View>
          </View>
        </View>

        <View style={s.th}>
          <Text style={s.cDesc}>DESCRIPTION</Text>
          <Text style={s.cAmt}>AMOUNT</Text>
        </View>
        {lines.map((l, n) => (
          <View key={n} style={s.tr} wrap={false}>
            <Text style={s.cDesc}>{l.description}</Text>
            <Text style={s.cAmt}>{money(l.amount)}</Text>
          </View>
        ))}

        <View style={s.totals}>
          <View style={s.grand}><Text style={s.grandText}>Total</Text><Text style={s.grandText}>{pkr(i.total)}</Text></View>
          {i.amountPaid > 0 && <View style={s.totalRow}><Text>Paid</Text><Text>{pkr(i.amountPaid)}</Text></View>}
          {i.status !== "void" && balance > 0 && (
            <View style={s.balance}><Text style={{ fontFamily: FONT_BOLD, color: DANGER }}>Amount due</Text><Text style={{ fontFamily: FONT_BOLD, color: DANGER }}>{pkr(balance)}</Text></View>
          )}
        </View>

        {pay.length > 0 && i.status !== "void" && balance > 0 && (
          <View style={s.pay} wrap={false}>
            <Text style={s.label}>HOW TO PAY · USE {i.number} AS THE PAYMENT REFERENCE</Text>
            {pay.map((l) => <Text key={l} style={s.payLine}>{l}</Text>)}
            {payTo.note && <Text style={[s.small, { marginTop: 6 }]}>{payTo.note}</Text>}
          </View>
        )}

        <View style={s.footer} fixed>
          <Text>{seller.name} · ProductLogik Invoicing System subscription</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
