import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, NativeSelect } from "@/components/common";
import { api, errMsg } from "@/lib/api";

export const SCRIPT_STATUSES = [
  ["BOZZA", "Bozza"], ["SCRIPT_PRONTO", "Script pronto"], ["DA_REGISTRARE", "Da registrare"],
  ["REGISTRATO", "Registrato"], ["IN_MONTAGGIO", "In montaggio"], ["COMPLETATO", "Completato"],
];

const EMPTY = { client_id: "", title: "", concept: "", script_body: "", status: "BOZZA", shooting_date: "", notes: "" };

export default function VideoScriptDialog({ open, onOpenChange, clients, script, clientId, onSaved }) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) setForm({ ...EMPTY, ...(script || {}), client_id: script?.client_id || clientId || "" });
  }, [open, script, clientId]);
  const set = (key) => (event) => setForm((value) => ({ ...value, [key]: event.target.value }));
  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const body = { ...form, client_id: Number(form.client_id), shooting_date: form.shooting_date || null };
      const result = script ? await api.put(`/scripts/${script.id}`, body) : await api.post("/scripts", body);
      toast.success(script ? "Script aggiornato" : "Script creato");
      onSaved?.(result.data);
      onOpenChange(false);
    } catch (error) {
      toast.error(errMsg(error));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="mx-4 max-h-[90vh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto p-4 sm:p-6" data-testid="video-script-dialog">
        <DialogHeader><DialogTitle>{script ? "Modifica script / idea" : "Nuovo script / idea video"}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Cliente *"><NativeSelect required value={form.client_id} onChange={set("client_id")} disabled={!!clientId}>
            <option value="">Seleziona cliente</option>
            {(clients || []).map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
          </NativeSelect></Field>
          <Field label="Titolo / concept *"><Input required value={form.title} onChange={set("title")} /></Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Stato"><NativeSelect value={form.status} onChange={set("status")}>{SCRIPT_STATUSES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</NativeSelect></Field>
            <Field label="Data shooting"><Input type="date" value={form.shooting_date || ""} onChange={set("shooting_date")} /></Field>
          </div>
          <Field label="Idea / concept"><Textarea rows={3} value={form.concept} onChange={set("concept")} /></Field>
          <Field label="Script / copione"><Textarea rows={8} value={form.script_body} onChange={set("script_body")} placeholder="Hook, dialoghi, CTA..." /></Field>
          <Field label="Note tecniche, location, attrezzatura"><Textarea rows={3} value={form.notes} onChange={set("notes")} /></Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
            <Button type="submit" disabled={saving} className="bg-indigo-600 hover:bg-indigo-700">{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salva</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
