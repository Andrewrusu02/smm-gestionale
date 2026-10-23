import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, Loader2, Plus, RotateCcw, Trash2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Chip, ConfirmDialog, EmptyState, Field, NativeSelect, PageHeader, StatCard } from "@/components/common";
import { api, errMsg, qs, useApi } from "@/lib/api";
import { eur, fmtDate, PAYMENT_STATUS, todayISO } from "@/lib/constants";

function PaidDialog({ payment, onClose, onDone }) {
  const [date, setDate] = useState(todayISO());
  const [busy, setBusy] = useState(false);
  useEffect(() => setDate(todayISO()), [payment]);
  const submit = async () => {
    setBusy(true);
    try {
      await api.post(`/payments/${payment.id}/mark-paid`, { paid_date: date });
      toast.success("Pagamento segnato come saldato");
      onDone();
      onClose();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={!!payment} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="mx-4 max-h-[90vh] w-[calc(100%-2rem)] max-w-sm overflow-y-auto p-4 sm:p-6" data-testid="mark-paid-dialog">
        <DialogHeader><DialogTitle>Pagamento effettuato</DialogTitle></DialogHeader>
        {payment && <p className="text-sm text-slate-600">{payment.client_name} · <b className="font-num">{eur(payment.amount)}</b></p>}
        <Field label="Data pagamento"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} data-testid="paid-date-input" /></Field>
        <DialogFooter>
          <Button onClick={submit} disabled={busy} className="bg-emerald-600 hover:bg-emerald-700" data-testid="confirm-mark-paid">
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Segna come saldato
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const EMPTY = { client_id: "", kind: "single_job", description: "", invoice_number: "", amount: "", due_date: todayISO(), notes: "" };

function InvoiceDialog({ open, onOpenChange, clients, onDone }) {
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setForm({ ...EMPTY, client_id: clients[0]?.id || "" }); }, [open, clients]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/payments", { ...form, client_id: Number(form.client_id), amount: Number(form.amount) });
      toast.success("Fattura registrata");
      onDone();
      onOpenChange(false);
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="mx-4 max-h-[90vh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto p-4 sm:p-6" data-testid="invoice-dialog">
        <DialogHeader><DialogTitle>Nuova fattura / scadenza</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Cliente *" className="sm:col-span-2">
            <NativeSelect required value={form.client_id} onChange={set("client_id")} data-testid="invoice-client-select">
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Tipo">
            <NativeSelect value={form.kind} onChange={set("kind")} data-testid="invoice-kind-select">
              <option value="single_job">Lavoro singolo</option>
              <option value="abbonamento">Abbonamento</option>
            </NativeSelect>
          </Field>
          <Field label="N. fattura"><Input value={form.invoice_number} onChange={set("invoice_number")} data-testid="invoice-number-input" /></Field>
          <Field label="Descrizione" className="sm:col-span-2"><Input value={form.description} onChange={set("description")} data-testid="invoice-description-input" /></Field>
          <Field label="Importo (€) *"><Input type="number" step="0.01" min={0} required value={form.amount} onChange={set("amount")} data-testid="invoice-amount-input" /></Field>
          <Field label="Scadenza *"><Input type="date" required value={form.due_date} onChange={set("due_date")} data-testid="invoice-due-input" /></Field>
          <DialogFooter className="sm:col-span-2">
            <Button type="submit" disabled={busy || !clients.length} className="w-full bg-indigo-600 hover:bg-indigo-700 sm:w-auto" data-testid="invoice-submit">
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Registra
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function Payments() {
  const [f, setF] = useState({ status: "", kind: "", period: "", client_id: "" });
  const { data, reload } = useApi(`/payments${qs(f)}`);
  const { data: clients } = useApi("/clients/basic");
  const [paying, setPaying] = useState(null);
  const [invoice, setInvoice] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  const sum = useMemo(() => {
    const list = data || [];
    const by = (st) => list.filter((p) => p.status === st).reduce((a, p) => a + p.amount, 0);
    return { attesa: by("in_attesa"), ritardo: by("in_ritardo"), saldato: by("saldato"), lateCount: list.filter((p) => p.status === "in_ritardo").length };
  }, [data]);
  const pending = (data || []).filter((p) => p.status !== "saldato");
  const paid = (data || []).filter((p) => p.status === "saldato");

  const act = async (fn, ok) => {
    try { await fn(); toast.success(ok); reload(); } catch (e) { toast.error(errMsg(e)); }
  };

  useEffect(() => {
    const handlePaymentsReload = () => reload();
    window.addEventListener("payments:reload", handlePaymentsReload);
    return () => window.removeEventListener("payments:reload", handlePaymentsReload);
  }, [reload]);

  return (
    <div data-testid="payments-page">
      <PageHeader eyebrow="Amministrazione" title="Pagamenti" subtitle="Pagamenti degli abbonamenti e fatture dei lavori singoli. Lo stato In ritardo si aggiorna in automatico dopo la scadenza."
        actions={<>
          <Button onClick={() => setInvoice(true)} className="rounded-xl bg-indigo-600 hover:bg-indigo-700" data-testid="add-invoice-button"><Plus className="mr-2 h-4 w-4" />Nuova fattura</Button>
        </>} />
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Da incassare" value={eur(sum.attesa)} icon={Clock} tone="slate" testId="payments-total-pending" />
        <StatCard label="In ritardo" value={eur(sum.ritardo)} hint={`${sum.lateCount} pagamenti`} icon={AlertTriangle} tone="rose" testId="payments-total-late" className="rise-1" />
        <StatCard label="Saldato" value={eur(sum.saldato)} icon={Wallet} tone="emerald" testId="payments-total-paid" className="rise-2" />
      </div>
      <div className="mb-4 flex flex-wrap gap-3">
        <NativeSelect value={f.status} onChange={set("status")} className="w-40" data-testid="payments-status-filter">
          <option value="">Tutti gli stati</option>
          {Object.entries(PAYMENT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </NativeSelect>
        <NativeSelect value={f.kind} onChange={set("kind")} className="w-44" data-testid="payments-kind-filter">
          <option value="">Tutti i tipi</option><option value="abbonamento">Abbonamenti</option><option value="single_job">Lavori singoli</option>
        </NativeSelect>
        <NativeSelect value={f.client_id} onChange={set("client_id")} className="w-48" data-testid="payments-client-filter">
          <option value="">Tutti i clienti</option>
          {(clients || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </NativeSelect>
        <Input type="month" value={f.period} onChange={set("period")} className="w-44 bg-white" data-testid="payments-period-filter" />
      </div>
      {!data?.length ? <EmptyState icon={Wallet} title="Nessun pagamento" text="Le rate degli abbonamenti vengono create automaticamente ogni mese." testId="payments-empty" /> : (
        <>
        <PaymentSection title="Da saldare" payments={pending} paying={setPaying} act={act} />
        <details className="mt-6 rounded-2xl border border-slate-200/80 bg-white shadow-sm">
          <summary className="cursor-pointer px-5 py-4 text-sm font-bold text-slate-700">Pagamenti Effettuati ({paid.length})</summary>
          <div className="border-t border-slate-100 p-4"><PaymentTable data={paid} setPaying={setPaying} act={act} /></div>
        </details>
        </>
      )}
      <PaidDialog payment={paying} onClose={() => setPaying(null)} onDone={reload} />
      <InvoiceDialog open={invoice} onOpenChange={setInvoice} clients={clients || []} onDone={reload} />
    </div>
  );
}

function PaymentSection({ title, payments, setPaying, act }) {
  return <section>
    <h2 className="mb-3 text-lg font-bold text-slate-800">{title}</h2>
    {!payments.length ? <p className="rounded-xl border border-dashed p-5 text-sm text-slate-500">Nessun pagamento da saldare.</p> : <PaymentTable data={payments} setPaying={setPaying} act={act} />}
  </section>;
}

function PaymentTable({ data, setPaying, act }) {
  return (
        <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white shadow-sm">
          <Table data-testid="payments-table">
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead><TableHead>Descrizione</TableHead><TableHead>Scadenza</TableHead>
                <TableHead className="text-right">Importo</TableHead><TableHead>Stato</TableHead><TableHead>Pagato il</TableHead><TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((p) => (
                <TableRow key={p.id} data-testid={`payment-row-${p.id}`}>
                  <TableCell className="font-semibold">{p.client_name}</TableCell>
                  <TableCell className="text-sm text-slate-600">{p.description || "—"}{p.invoice_number && <span className="block text-xs text-slate-400">Fatt. {p.invoice_number}</span>}</TableCell>
                  <TableCell className="font-num text-xs">{fmtDate(p.due_date)}</TableCell>
                  <TableCell className="font-num text-right font-bold">{eur(p.amount)}</TableCell>
                  <TableCell><Chip className={(PAYMENT_STATUS[p.status] || PAYMENT_STATUS.in_attesa).chip} testId={`payment-status-badge-${p.id}`}>{(PAYMENT_STATUS[p.status] || PAYMENT_STATUS.in_attesa).label}</Chip></TableCell>
                  <TableCell className="font-num text-xs">{fmtDate(p.paid_date)}</TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    {p.status !== "saldato" ? (
                      <Button size="sm" variant="outline" className="h-8 border-emerald-200 text-emerald-700 hover:bg-emerald-50" onClick={() => setPaying(p)} data-testid={`mark-paid-${p.id}`}>
                        <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />Pagamento effettuato
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" className="h-8 text-slate-500" onClick={() => act(() => api.post(`/payments/${p.id}/mark-unpaid`), "Pagamento annullato")} data-testid={`mark-unpaid-${p.id}`}>
                        <RotateCcw className="mr-1.5 h-3.5 w-3.5" />Annulla
                      </Button>
                    )}
                    <ConfirmDialog testId={`delete-payment-${p.id}`} title="Eliminare il pagamento?" onConfirm={() => act(() => api.delete(`/payments/${p.id}`), "Pagamento eliminato")}
                      trigger={<Button size="icon" variant="ghost" className="h-8 w-8 text-rose-600" data-testid={`delete-payment-btn-${p.id}`}><Trash2 className="h-4 w-4" /></Button>} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
  );
}
