import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, NativeSelect } from "@/components/common";
import { api, errMsg } from "@/lib/api";
import { eur, PACKAGE_STYLE } from "@/lib/constants";
import { cn } from "@/lib/utils";

const EMPTY = {
  name: "", package: null, contact_name: "", email: "", phone: "", vat_number: "",
  notes: "", billing_day: 5,
  start_date: "", active: true, invoice_due_date: "", lead_id: null,
  custom_price: "", custom_reel: "", custom_sessione: "", custom_carosello: "", custom_grafica: "", custom_storia: "",
};

const CUSTOM = [["custom_reel", "Reels"], ["custom_sessione", "Sessioni registrazione"], ["custom_carosello", "Caroselli"], ["custom_grafica", "Grafiche"], ["custom_storia", "Storie"]];
const num = (v) => (v === "" || v == null ? null : Number(v));

const PKG_LINES = (l) => `${l.reel} Reels · ${l.sessione} sessioni · ${l.carosello} caroselli · max ${l.grafica} grafiche`;

function PackagePicker({ packages, form, set }) {
  const p = packages[form.package];
  return (
    <div className="space-y-3">
      {form.package === "personalizzato" ? (
        <div className="grid grid-cols-2 gap-3 rounded-xl border border-pink-200 bg-pink-50/40 p-4 sm:grid-cols-3" data-testid="custom-package-fields">
          <Field label="Costo mensile (€) *"><Input type="number" min={0} step="0.01" required value={form.custom_price} onChange={set("custom_price")} className="bg-white" data-testid="custom-price-input" /></Field>
          {CUSTOM.map(([k, l]) => (
            <Field key={k} label={l}><Input type="number" min={0} value={form[k]} onChange={set(k)} className="bg-white" placeholder="0" data-testid={`${k.replace("_", "-")}-input`} /></Field>
          ))}
        </div>
      ) : p && (
        <p className={cn("rounded-lg border px-3 py-2 text-xs", PACKAGE_STYLE[form.package].chip)} data-testid="package-summary">{PKG_LINES(p.limits)}</p>
      )}
    </div>
  );
}

export default function ClientFormDialog({ open, onOpenChange, client, prefill, onSaved }) {
  const [form, setForm] = useState(EMPTY);
  const [packages, setPackages] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    api.get("/packages").then((r) => setPackages(r.data));
    setForm(client
      ? { ...EMPTY, ...Object.fromEntries(Object.entries(client).map(([k, v]) => [k, v ?? ""])), package: client.package || null, lead_id: null }
      : { ...EMPTY, ...(prefill || {}) });
  }, [open, client, prefill]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? e.target.value : e }));
  const isSub = Boolean(form.package);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const body = {
      ...form,
      package: isSub ? form.package : null,
      billing_day: Number(form.billing_day) || 5,
      start_date: form.start_date || null,
      invoice_due_date: form.invoice_due_date || null,
      lead_id: form.lead_id || null,
      ...Object.fromEntries(["custom_price", ...CUSTOM.map(([k]) => k)].map((k) => [k, num(form[k])])),
    };
    try {
      const { data } = client ? await api.put(`/clients/${client.id}`, body) : await api.post("/clients", body);
      toast.success(client ? "Cliente aggiornato" : "Cliente creato");
      onSaved?.(data);
      if (client) window.dispatchEvent(new Event("payments:reload"));
      onOpenChange(false);
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="mx-4 max-h-[90vh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto p-4 sm:p-6" data-testid="client-form-dialog">
        <DialogHeader><DialogTitle>{client ? "Modifica cliente" : form.lead_id ? "Converti lead in cliente" : "Nuovo cliente"}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-5">
          <p className="rounded-xl border border-indigo-100 bg-indigo-50/60 px-4 py-3 text-sm text-indigo-800">Cliente neutro: questa scheda contiene solo l'anagrafica. Puoi aggiungere un abbonamento oppure associare lavori singoli dai task.</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Nome cliente *" className="sm:col-span-2"><Input required value={form.name} onChange={set("name")} data-testid="client-name-input" /></Field>
            <Field label="Referente"><Input value={form.contact_name} onChange={set("contact_name")} data-testid="client-contact-input" /></Field>
            <Field label="Email"><Input type="email" value={form.email} onChange={set("email")} data-testid="client-email-input" /></Field>
            <Field label="Telefono"><Input value={form.phone} onChange={set("phone")} data-testid="client-phone-input" /></Field>
            <Field label="P. IVA / C.F."><Input value={form.vat_number} onChange={set("vat_number")} data-testid="client-vat-input" /></Field>
          </div>
          <div className="space-y-4">
            <Field label="Abbonamento (facoltativo)">
              <NativeSelect value={form.package || ""} onChange={(e) => setForm((f) => ({ ...f, package: e.target.value || null }))} data-testid="client-package-select">
                <option value="">Nessun abbonamento</option>
                {Object.entries(packages).map(([k, v]) => <option key={k} value={k}>{`${v.name} — ${eur(v.price)}/mese`}</option>)}
                <option value="personalizzato">Personalizzato — prezzo e quote su misura</option>
              </NativeSelect>
            </Field>
          {isSub && (
            <div className="space-y-4">
              <Field label="Pacchetto *"><PackagePicker packages={packages} form={form} set={set} /></Field>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Inizio abbonamento"><Input type="date" value={form.start_date} onChange={set("start_date")} data-testid="client-start-input" /></Field>
                <Field label="Giorno scadenza mensile" hint="Giorno del mese (1-28) in cui scade la rata"><Input type="number" min={1} max={28} value={form.billing_day} onChange={set("billing_day")} data-testid="client-billing-day-input" /></Field>
              </div>
            </div>
          )}
          </div>
          <Field label="Note"><Textarea value={form.notes} onChange={set("notes")} data-testid="client-notes-input" /></Field>
          {client && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={!!form.active} onChange={(e) => set("active")(e.target.checked)} data-testid="client-active-checkbox" /> Cliente attivo
            </label>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
            <Button type="submit" disabled={saving} className="bg-indigo-600 hover:bg-indigo-700" data-testid="client-form-submit">
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{client ? "Salva modifiche" : "Crea cliente"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
