import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRightLeft, ExternalLink, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog, Field, NativeSelect } from "@/components/common";
import ClientFormDialog from "@/pages/ClientFormDialog";
import { api, errMsg } from "@/lib/api";
import { LEAD_STATUS } from "@/lib/constants";

const EMPTY = { name: "", contact_name: "", email: "", phone: "", meeting_at: "", duration_minutes: 60, location: "", notes: "", status: "nuovo" };

function ConvertBox({ lead, onPick }) {
  const navigate = useNavigate();
  if (lead.converted_client_id)
    return (
      <Button type="button" variant="outline" onClick={() => navigate(`/clienti/${lead.converted_client_id}`)} data-testid="lead-open-client-button">
        <ExternalLink className="mr-2 h-4 w-4" />Apri cliente {lead.converted_client_name}
      </Button>
    );
  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4" data-testid="lead-convert-box">
      <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-emerald-800"><ArrowRightLeft className="h-4 w-4" />Converti in Cliente</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={onPick} data-testid="convert-to-client-button">Crea cliente neutro</Button>
      </div>
    </div>
  );
}

export default function LeadFormDialog({ open, onOpenChange, lead, defaultDate, onSaved }) {
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [prefill, setPrefill] = useState(null);

  useEffect(() => {
    if (!open) return;
    setForm(lead
      ? { ...EMPTY, ...Object.fromEntries(Object.entries(lead).map(([k, v]) => [k, v ?? ""])), meeting_at: lead.meeting_at ? lead.meeting_at.slice(0, 16) : "" }
      : { ...EMPTY, meeting_at: defaultDate ? `${defaultDate}T15:00` : "" });
  }, [open, lead, defaultDate]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const body = { ...form, meeting_at: form.meeting_at || null, duration_minutes: Number(form.duration_minutes) || 60 };
    try {
      if (lead) await api.put(`/leads/${lead.id}`, body);
      else await api.post("/leads", body);
      toast.success(lead ? "Lead aggiornato" : "Lead creato");
      onSaved();
      onOpenChange(false);
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    try {
      await api.delete(`/leads/${lead.id}`);
      toast.success("Lead eliminato");
      onSaved();
      onOpenChange(false);
    } catch (err) {
      toast.error(errMsg(err));
    }
  };

  const startConvert = () => setPrefill({
    lead_id: lead.id, name: form.name, contact_name: form.contact_name, email: form.email, phone: form.phone, notes: form.notes,
  });

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="mx-4 max-h-[90vh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto p-4 sm:p-6" data-testid="lead-form-dialog">
          <DialogHeader><DialogTitle>{lead ? "Scheda potenziale cliente" : "Nuovo lead / appuntamento"}</DialogTitle></DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <Field label="Nome potenziale cliente *"><Input required value={form.name} onChange={set("name")} data-testid="lead-name-input" /></Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Referente"><Input value={form.contact_name} onChange={set("contact_name")} data-testid="lead-contact-input" /></Field>
              <Field label="Stato">
                <NativeSelect value={form.status} onChange={set("status")} data-testid="lead-status-select">
                  {Object.entries(LEAD_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </NativeSelect>
              </Field>
              <Field label="Email"><Input type="email" value={form.email} onChange={set("email")} data-testid="lead-email-input" /></Field>
              <Field label="Telefono"><Input value={form.phone} onChange={set("phone")} data-testid="lead-phone-input" /></Field>
              <Field label="Data e ora appuntamento"><Input type="datetime-local" value={form.meeting_at} onChange={set("meeting_at")} data-testid="lead-meeting-input" /></Field>
              <Field label="Durata (min)"><Input type="number" min={5} value={form.duration_minutes} onChange={set("duration_minutes")} data-testid="lead-duration-input" /></Field>
            </div>
            <Field label="Luogo / link videochiamata"><Input value={form.location} onChange={set("location")} placeholder="es. Google Meet, sede cliente..." data-testid="lead-location-input" /></Field>
            <Field label="Note / obiettivi della chiamata"><Textarea rows={4} value={form.notes} onChange={set("notes")} data-testid="lead-notes-input" /></Field>
            {lead?.google_event_id && <p className="text-xs text-emerald-600">Sincronizzato con Google Calendar</p>}
            {lead && <ConvertBox lead={lead} onPick={startConvert} />}
            <DialogFooter className="gap-2 sm:justify-between">
              {lead ? (
                <ConfirmDialog testId="delete-lead" title="Eliminare il lead?" description="Verrà rimosso anche l'evento su Google Calendar." onConfirm={remove}
                  trigger={<Button type="button" variant="ghost" className="text-rose-600" data-testid="delete-lead-button"><Trash2 className="mr-2 h-4 w-4" />Elimina</Button>} />
              ) : <span />}
              <Button type="submit" disabled={saving} className="bg-indigo-600 hover:bg-indigo-700" data-testid="lead-form-submit">
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{lead ? "Salva" : "Crea lead"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <ClientFormDialog open={!!prefill} onOpenChange={(o) => !o && setPrefill(null)} prefill={prefill}
        onSaved={(c) => { setPrefill(null); onOpenChange(false); onSaved(); toast.success("Lead convertito in cliente"); navigate(`/clienti/${c.id}`); }} />
    </>
  );
}
