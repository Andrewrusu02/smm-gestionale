import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, NativeSelect } from "@/components/common";
import { api, errMsg } from "@/lib/api";
import { todayISO } from "@/lib/constants";

export default function CompleteTaskDialog({ task, open, onOpenChange, users, onCompleted }) {
  const [form, setForm] = useState({ completed_by: "", completed_at: todayISO(), notes: "", client_revenue: "", worker_expense: "" });
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) setForm({ completed_by: "", completed_at: todayISO(), notes: "", client_revenue: task?.price_charged_to_client ?? "", worker_expense: "" });
  }, [open, task]);
  const set = (key) => (event) => setForm((value) => ({ ...value, [key]: event.target.value }));
  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      await api.post(`/tasks/${task.id}/complete`, {
        completed_by: form.completed_by ? Number(form.completed_by) : null,
        completed_at: form.completed_at ? `${form.completed_at}T12:00:00` : null,
        notes: form.notes || null,
        client_revenue: Number(form.client_revenue || 0),
        worker_expense: Number(form.worker_expense || 0),
      });
      toast.success("Lavoro registrato e task rimosso");
      onCompleted();
      onOpenChange(false);
    } catch (error) {
      toast.error(errMsg(error));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="mx-4 max-h-[90vh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto p-4 sm:p-6">
        <DialogHeader><DialogTitle>Completa: {task?.title}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Eseguito da"><NativeSelect value={form.completed_by} onChange={set("completed_by")}>
            <option value="">Io / operatore corrente</option>
            {users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
          </NativeSelect></Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Data effettiva *"><Input required type="date" value={form.completed_at} onChange={set("completed_at")} /></Field>
            <Field label="Entrata cliente (€)" hint="Precompilata dal prezzo del task"><Input type="number" min="0" step="0.01" value={form.client_revenue} onChange={set("client_revenue")} /></Field>
            <Field label="Tuo compenso / Spesa operatore (€) *" hint="Costo riconosciuto al collaboratore per questo lavoro"><Input required type="number" min="0" step="0.01" value={form.worker_expense} onChange={set("worker_expense")} /></Field>
          </div>
          <Field label="Note"><Textarea value={form.notes} onChange={set("notes")} /></Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
            <Button type="submit" disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Completa e registra
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
