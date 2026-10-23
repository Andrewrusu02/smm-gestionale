import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, NativeSelect } from "@/components/common";
import { api, errMsg } from "@/lib/api";

const EMPTY = { client_id: "", title: "", description: "", start_date: "", due_date: "", price: "", assigned_to: "" };

export default function SingleJobDialog({ open, onOpenChange, clients, users, clientId, onSaved }) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) setForm({ ...EMPTY, client_id: clientId || "" }); }, [open, clientId]);
  const set = (key) => (event) => setForm((value) => ({ ...value, [key]: event.target.value }));
  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      await api.post("/contracts", {
        client_id: Number(form.client_id), type: "SINGLE_JOB", title: form.title,
        description: form.description || null,         start_date: form.start_date || null, due_date: form.due_date,
        price: form.price === "" ? 0 : Number(form.price),
        assigned_to: form.assigned_to ? Number(form.assigned_to) : null,
      });
      toast.success("Lavoro singolo creato e task generato");
      onSaved();
      onOpenChange(false);
    } catch (error) {
      toast.error(errMsg(error));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="mx-4 max-h-[90vh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto p-4 sm:p-6" data-testid="single-job-dialog">
        <DialogHeader><DialogTitle>Nuovo lavoro singolo</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Cliente *"><NativeSelect required value={form.client_id} onChange={set("client_id")} data-testid="single-job-client">
            <option value="">Seleziona cliente</option>
            {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
          </NativeSelect></Field>
          <Field label="Titolo del lavoro *"><Input required value={form.title} onChange={set("title")} data-testid="single-job-title" /></Field>
          <Field label="Descrizione"><Textarea value={form.description} onChange={set("description")} data-testid="single-job-description" /></Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Data inizio"><Input type="date" value={form.start_date} onChange={set("start_date")} data-testid="single-job-start-date" /></Field>
            <Field label="Data scadenza / consegna *"><Input required type="date" value={form.due_date} onChange={set("due_date")} data-testid="single-job-due-date" /></Field>
            <Field label="Prezzo pattuito (€)"><Input type="number" min="0" step="0.01" value={form.price} onChange={set("price")} data-testid="single-job-price" /></Field>
          </div>
          <Field label="Operatore assegnato (opzionale)"><NativeSelect value={form.assigned_to} onChange={set("assigned_to")} data-testid="single-job-assignee">
            <option value="">Non assegnato</option>
            {users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
          </NativeSelect></Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
            <Button type="submit" disabled={saving} className="bg-indigo-600 hover:bg-indigo-700" data-testid="single-job-submit">
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Crea lavoro e task
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
