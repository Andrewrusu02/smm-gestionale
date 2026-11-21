import { useEffect, useMemo, useState } from "react";
import { CalendarRange, Loader2, Pencil, Plus, Receipt, Repeat, Trash2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Chip, ConfirmDialog, EmptyState, Field, Loading, NativeSelect, PageHeader, Panel, StatCard } from "@/components/common";
import { api, errMsg, qs, useApi } from "@/lib/api";
import { currentPeriod, eur, fmtDate, periodLabel, todayISO } from "@/lib/constants";

const EMPTY = { title: "", category: "software", amount: "", kind: "recurring", date: todayISO(), frequency: "monthly", end_date: "", notes: "" };

function ExpenseDialog({ open, onOpenChange, expense, meta, onDone }) {
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setForm(expense ? { ...EMPTY, ...expense, end_date: expense.end_date || "", notes: expense.notes || "", frequency: expense.frequency || "monthly" } : EMPTY);
  }, [open, expense]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const recurring = form.kind === "recurring";
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    const body = {
      title: form.title, category: form.category, amount: Number(form.amount) || 0, kind: form.kind, date: form.date,
      frequency: recurring ? form.frequency : null, end_date: recurring && form.end_date ? form.end_date : null, notes: form.notes || null,
    };
    try {
      if (expense) await api.put(`/expenses/${expense.id}`, body);
      else await api.post("/expenses", body);
      toast.success(expense ? "Spesa aggiornata" : "Spesa aggiunta");
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
      <DialogContent className="mx-4 max-h-[90vh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto p-4 sm:p-6">
        <DialogHeader><DialogTitle>{expense ? "Modifica spesa" : "Nuova spesa"}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="grid grid-cols-2 gap-2 sm:col-span-2">
            {[["recurring", "Ricorrente", Repeat], ["one_off", "Una tantum", Receipt]].map(([key, label, Icon]) => (
              <Button key={key} type="button" variant="outline" onClick={() => setForm((f) => ({ ...f, kind: key }))}
                className={form.kind === key ? "border-indigo-500 bg-indigo-50 text-indigo-700" : ""} data-testid={`expense-kind-${key}`}>
                <Icon className="mr-2 h-4 w-4" />{label}
              </Button>
            ))}
          </div>
          <Field label="Descrizione" className="sm:col-span-2"><Input required value={form.title} onChange={set("title")} placeholder={recurring ? "Es. Abbonamento Adobe" : "Es. Microfono wireless"} data-testid="expense-title" /></Field>
          <Field label="Categoria">
            <NativeSelect value={form.category} onChange={set("category")} data-testid="expense-category">
              {(meta?.categories || []).map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Importo (€)"><Input required type="number" min="0" step="0.01" value={form.amount} onChange={set("amount")} data-testid="expense-amount" /></Field>
          <Field label={recurring ? "Dal" : "Data"}><Input required type="date" value={form.date} onChange={set("date")} data-testid="expense-date" /></Field>
          {recurring ? (
            <Field label="Frequenza">
              <NativeSelect value={form.frequency} onChange={set("frequency")} data-testid="expense-frequency">
                {(meta?.frequencies || []).map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
              </NativeSelect>
            </Field>
          ) : <div className="hidden sm:block" />}
          {recurring && <Field label="Fino al (facoltativo)" hint="Lascia vuoto se la spesa è ancora attiva"><Input type="date" value={form.end_date} onChange={set("end_date")} data-testid="expense-end-date" /></Field>}
          <Field label="Note" className="sm:col-span-2"><Textarea rows={2} value={form.notes} onChange={set("notes")} /></Field>
          <DialogFooter className="sm:col-span-2">
            <Button type="submit" disabled={busy} className="w-full bg-indigo-600 hover:bg-indigo-700 sm:w-auto" data-testid="expense-save">{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salva</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function Expenses() {
  const [period, setPeriod] = useState(currentPeriod);
  const [year, month] = period.split("-").map(Number);
  const [kind, setKind] = useState("");
  const { data: meta } = useApi("/expenses/meta");
  const { data: items, loading, reload } = useApi(`/expenses${qs({ kind })}`);
  const { data: summary, reload: reloadSummary } = useApi(`/expenses/summary?year=${year}&month=${month}`);
  const [dialog, setDialog] = useState({ open: false, expense: null });
  const refresh = () => { reload(); reloadSummary(); };
  const maxCat = useMemo(() => Math.max(1, ...(summary?.by_category || []).map((c) => c.year)), [summary]);
  const remove = async (e) => {
    try { await api.delete(`/expenses/${e.id}`); toast.success("Spesa eliminata"); refresh(); } catch (err) { toast.error(errMsg(err)); }
  };
  return (
    <div data-testid="expenses-page">
      <PageHeader
        eyebrow="Costi dell'agenzia"
        title="Spese generali"
        subtitle="Abbonamenti, affitto, attrezzatura e altri costi che non sono compensi del team. Entrano nell'utile reale della Dashboard."
        actions={<>
          <Input type="month" value={period} onChange={(e) => e.target.value && setPeriod(e.target.value)} className="h-10 w-40 bg-white" data-testid="expenses-period" />
          <Button onClick={() => setDialog({ open: true, expense: null })} className="bg-indigo-600 hover:bg-indigo-700" data-testid="expense-new"><Plus className="mr-2 h-4 w-4" />Nuova spesa</Button>
        </>}
      />
      {summary && (
        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          <StatCard label={`Spese di ${periodLabel(period, true)}`} value={eur(summary.month_total)} icon={Wallet} tone="rose" testId="expenses-month-total" />
          <StatCard label="Ricorrenti al mese" value={eur(summary.recurring_monthly)} hint="Media mensile delle spese ricorrenti attive" icon={Repeat} tone="amber" className="rise-1" />
          <StatCard label={`Totale ${year}`} value={eur(summary.year_total)} icon={CalendarRange} tone="slate" className="rise-2" />
        </div>
      )}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Panel title="Totali per categoria" testId="expenses-by-category">
          {!summary?.by_category?.length ? <p className="text-sm text-slate-500">Nessuna spesa nel {year}.</p> : (
            <ul className="space-y-3">
              {summary.by_category.map((c) => (
                <li key={c.category}>
                  <div className="flex justify-between text-sm">
                    <span className="font-semibold text-slate-800">{c.label}</span>
                    <span className="font-num text-slate-600">{eur(c.month)} <span className="text-slate-400">/ {eur(c.year)} anno</span></span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-slate-100"><div className="h-full rounded-full bg-rose-400" style={{ width: `${(c.year / maxCat) * 100}%` }} /></div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel
          title="Elenco spese"
          className="xl:col-span-2"
          action={<NativeSelect value={kind} onChange={(e) => setKind(e.target.value)} className="h-9 w-40" data-testid="expenses-kind-filter">
            <option value="">Tutte</option><option value="recurring">Ricorrenti</option><option value="one_off">Una tantum</option>
          </NativeSelect>}
        >
          {loading && !items ? <Loading /> : !items?.length ? (
            <EmptyState icon={Wallet} title="Nessuna spesa" text="Aggiungi abbonamenti, affitto o acquisti per vedere l'utile reale." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {items.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 py-3" data-testid="expense-row">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-slate-900">{e.title}</p>
                      <Chip className="border-slate-200 bg-slate-50 text-slate-600">{e.category_label}</Chip>
                      {e.kind === "recurring"
                        ? <Chip className="border-amber-200 bg-amber-50 text-amber-800"><Repeat className="h-3 w-3" />{e.frequency_label}</Chip>
                        : <Chip className="border-sky-200 bg-sky-50 text-sky-700">Una tantum</Chip>}
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {e.kind === "recurring" ? `Dal ${fmtDate(e.date)}${e.end_date ? ` al ${fmtDate(e.end_date)}` : ""}` : fmtDate(e.date)}
                      {e.notes && ` · ${e.notes}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="mr-2 font-num font-bold text-slate-900">{eur(e.amount)}</span>
                    <Button size="icon" variant="ghost" onClick={() => setDialog({ open: true, expense: e })} title="Modifica"><Pencil className="h-4 w-4" /></Button>
                    <ConfirmDialog title="Eliminare la spesa?" description={`«${e.title}» non verrà più conteggiata.`} onConfirm={() => remove(e)}
                      trigger={<Button size="icon" variant="ghost" className="text-rose-600" title="Elimina"><Trash2 className="h-4 w-4" /></Button>} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
      <ExpenseDialog open={dialog.open} onOpenChange={(o) => setDialog((d) => ({ ...d, open: o }))} expense={dialog.expense} meta={meta} onDone={refresh} />
    </div>
  );
}
