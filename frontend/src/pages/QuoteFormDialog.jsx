import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, NativeSelect } from "@/components/common";
import { api, errMsg } from "@/lib/api";
import { todayISO } from "@/lib/constants";

const emptyItem = () => ({ description: "", quantity: "1", unit_price: "" });
const EMPTY = { client_id: "", issue_date: todayISO(), delivery_date: "", validity_date: "", status: "bozza", tax_rate: "0", notes: "", items: [emptyItem()] };

export default function QuoteFormDialog({ open, onOpenChange, quote, clients, onSaved }) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) setForm(quote ? { ...quote, client_id: String(quote.client_id), tax_rate: String(quote.tax_rate), items: quote.items.map((i) => ({ ...i, quantity: String(i.quantity), unit_price: String(i.unit_price) })) } : EMPTY);
  }, [open, quote]);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const setItem = (index, key) => (e) => setForm((f) => ({ ...f, items: f.items.map((item, i) => i === index ? { ...item, [key]: e.target.value } : item) }));
  const subtotal = form.items.reduce((sum, i) => sum + (Number(i.quantity) || 0) * (Number(i.unit_price) || 0), 0);
  const total = subtotal * (1 + (Number(form.tax_rate) || 0) / 100);
  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const body = { client_id: Number(form.client_id), issue_date: form.issue_date, delivery_date: form.delivery_date || null, validity_date: form.validity_date || null, status: form.status, tax_rate: Number(form.tax_rate) || 0, notes: form.notes || null, items: form.items.map((i) => ({ description: i.description, quantity: Number(i.quantity), unit_price: Number(i.unit_price) })) };
      if (quote) await api.put(`/quotes/${quote.id}`, body); else await api.post("/quotes", body);
      toast.success(quote ? "Preventivo aggiornato" : "Preventivo creato");
      onSaved(); onOpenChange(false);
    } catch (e) { toast.error(errMsg(e)); } finally { setSaving(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="mx-4 max-h-[90vh] w-[calc(100%-2rem)] max-w-3xl overflow-y-auto p-4 sm:p-6" data-testid="quote-form-dialog">
        <DialogHeader><DialogTitle>{quote ? "Modifica preventivo" : "Nuovo preventivo"}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Cliente *"><NativeSelect required value={form.client_id} onChange={set("client_id")}><option value="">Seleziona cliente</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</NativeSelect></Field>
            <Field label="Stato"><NativeSelect value={form.status} onChange={set("status")}><option value="bozza">Bozza</option><option value="inviato">Inviato</option><option value="accettato">Accettato</option><option value="rifiutato">Rifiutato</option></NativeSelect></Field>
            <Field label="Data preventivo *"><Input required type="date" value={form.issue_date} onChange={set("issue_date")} /></Field>
            <Field label="Consegna del lavoro"><Input type="date" value={form.delivery_date} onChange={set("delivery_date")} /></Field>
            <Field label="Validità fino al"><Input type="date" value={form.validity_date} onChange={set("validity_date")} /></Field>
            <Field label="IVA (%)"><Input type="number" min="0" max="100" step="0.01" value={form.tax_rate} onChange={set("tax_rate")} /></Field>
          </div>
          <div className="rounded-xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3"><p className="text-sm font-bold">Servizi offerti</p><Button type="button" variant="outline" size="sm" onClick={() => setForm((f) => ({ ...f, items: [...f.items, emptyItem()] }))}><Plus className="mr-1 h-4 w-4" />Aggiungi servizio</Button></div>
            <div className="space-y-3 p-4">
              {form.items.map((item, index) => <div key={index} className="grid grid-cols-[1fr_90px_120px_36px] gap-2"><Input required placeholder="Descrizione servizio" value={item.description} onChange={setItem(index, "description")} /><Input required type="number" min="0.01" step="0.01" placeholder="Qtà" value={item.quantity} onChange={setItem(index, "quantity")} /><Input required type="number" min="0" step="0.01" placeholder="Prezzo €" value={item.unit_price} onChange={setItem(index, "unit_price")} /><Button type="button" variant="ghost" disabled={form.items.length === 1} onClick={() => setForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== index) }))}><Trash2 className="h-4 w-4 text-rose-500" /></Button></div>)}
              <div className="flex justify-end border-t border-slate-100 pt-3 text-sm"><div className="w-52 space-y-1"><p className="flex justify-between"><span>Imponibile</span><b>{subtotal.toFixed(2)} €</b></p><p className="flex justify-between text-base"><span>Totale</span><b>{total.toFixed(2)} €</b></p></div></div>
            </div>
          </div>
          <Field label="Note"><Textarea value={form.notes} onChange={set("notes")} placeholder="Condizioni, tempi o note aggiuntive" /></Field>
          <DialogFooter><Button type="submit" disabled={saving} className="bg-indigo-600 hover:bg-indigo-700">{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{quote ? "Salva modifiche" : "Crea preventivo"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
