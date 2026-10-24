import { useEffect, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog, Field, NativeSelect } from "@/components/common";
import { useAuth } from "@/context/AuthContext";
import { api, errMsg } from "@/lib/api";
import { PRIORITY, TASK_STATUSES } from "@/lib/constants";

const SERVICE_CATEGORIES = [
  ["reel", "Reel"],
  ["carosello", "Carosello"],
  ["grafica", "Grafica"],
  ["sessione", "Sessione di registrazione"],
  ["copywriting_script", "Copywriting / Script"],
  ["altro", "Altro"],
];
const EMPTY = { title: "", description: "", client_id: "", category_service: "", status: "da_fare", priority: "media", assignee_id: "", start_date: "", due_date: "", price_charged_to_client: "" };

export default function TaskFormDialog({ open, onOpenChange, task, clients, users, clientId, onSaved }) {
  const { user, isAdmin } = useAuth();
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setForm(task ? { ...EMPTY, ...Object.fromEntries(Object.entries(task).map(([k, v]) => [k, v ?? ""])) } : { ...EMPTY, client_id: clientId || "" });
  }, [open, task, clientId]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  const setAssigneeToMe = (e) => setForm((f) => ({ ...f, assignee_id: e.target.checked ? user.id : "" }));
  const canDelete = task && (isAdmin || task.created_by === user.id);
  const selectedClient = (clients || []).find((c) => String(c.id) === String(form.client_id));
  const selectedUsage = selectedClient?.usage?.find((u) => u.type === form.category_service);
  const isIncluded = task
    ? Boolean(task.subscription_included && task.category_service === form.category_service) ||
      Boolean(selectedClient?.active_subscription && selectedUsage?.remaining > 0)
    : Boolean(selectedClient?.active_subscription && selectedUsage?.remaining > 0);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const body = {
      title: form.title, description: form.description || null, client_id: form.client_id ? Number(form.client_id) : null,
      category_service: form.category_service,
      status: form.status, priority: form.priority, assignee_id: form.assignee_id ? Number(form.assignee_id) : null,
      start_date: form.start_date || null, due_date: form.due_date || null,
      price_charged_to_client: isIncluded ? 0 : Number(form.price_charged_to_client),
    };
    try {
      if (task) await api.put(`/tasks/${task.id}`, body);
      else await api.post("/tasks", body);
      toast.success(task ? "Task aggiornato" : "Task creato");
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
      await api.delete(`/tasks/${task.id}`);
      toast.success("Task eliminato");
      onSaved();
      onOpenChange(false);
    } catch (err) {
      toast.error(errMsg(err));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="mx-4 max-h-[90vh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto p-4 sm:p-6" data-testid="task-form-dialog">
        <DialogHeader><DialogTitle>{task ? "Modifica attività" : "Nuovo lavoro / attività"}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Titolo *"><Input required value={form.title} onChange={set("title")} data-testid="task-title-input" /></Field>
          <Field label="Descrizione"><Textarea value={form.description} onChange={set("description")} data-testid="task-description-input" /></Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Cliente">
              <NativeSelect value={form.client_id} onChange={set("client_id")} data-testid="task-client-select">
                <option value="">Seleziona cliente</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </NativeSelect>
            </Field>
            <Field label="CATEGORIA SERVIZIO *">
              <NativeSelect required disabled={Boolean(task?.subscription_included)} value={form.category_service} onChange={set("category_service")} data-testid="task-service-category-select">
                <option value="">Seleziona categoria</option>
                {SERVICE_CATEGORIES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </NativeSelect>
            </Field>
            <Field label="Data inizio"><Input type="date" value={form.start_date} onChange={set("start_date")} /></Field>
            <Field label="Scadenza"><Input type="date" value={form.due_date} onChange={set("due_date")} data-testid="task-due-input" /></Field>
            <Field label="Prezzo pattuito col Cliente (€)" hint="Entrata da incassare; non è il compenso del collaboratore">
              <Input type="number" min={0} step="0.01" required={!isIncluded} disabled={isIncluded} value={isIncluded ? 0 : form.price_charged_to_client} onChange={set("price_charged_to_client")} data-testid="task-price-input" />
            </Field>
            {form.category_service && (
              <p className={`col-span-2 rounded-lg px-3 py-2 text-sm font-medium ${isIncluded ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`} data-testid="task-billing-mode">
                {isIncluded
                  ? `✓ Incluso nell'abbonamento (verrà scalato 1 credito da ${SERVICE_CATEGORIES.find(([key]) => key === form.category_service)?.[1] ?? form.category_service}).`
                  : "⚠ Nessun abbonamento attivo o crediti esauriti per questa categoria. Verrà fatturato come Lavoro Extra."}
              </p>
            )}
            <Field label="Stato">
              <NativeSelect value={form.status} onChange={set("status")} data-testid="task-status-select">
                {TASK_STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </NativeSelect>
            </Field>
            <Field label="Priorità">
              <NativeSelect value={form.priority} onChange={set("priority")} data-testid="task-priority-select">
                {Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </NativeSelect>
            </Field>
          </div>
          {isAdmin ? (
            <Field label="Assegnatario">
              <NativeSelect value={form.assignee_id} onChange={set("assignee_id")} data-testid="task-assignee-select">
                <option value="">Non assegnato</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </NativeSelect>
            </Field>
          ) : (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={String(form.assignee_id) === String(user.id)} onChange={setAssigneeToMe} data-testid="task-assign-me-checkbox" />Assegna a me
            </label>
          )}
          <DialogFooter className="gap-2 sm:justify-between">
            {canDelete ? (
              <ConfirmDialog testId="delete-task" title="Eliminare il task?" onConfirm={remove}
                trigger={<Button type="button" variant="ghost" className="text-rose-600" data-testid="delete-task-button"><Trash2 className="mr-2 h-4 w-4" />Elimina</Button>} />
            ) : <span />}
            <Button type="submit" disabled={saving} className="bg-indigo-600 hover:bg-indigo-700" data-testid="task-form-submit">
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}              {task ? "Salva" : "Crea attività"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
