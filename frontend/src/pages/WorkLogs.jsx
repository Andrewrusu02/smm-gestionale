import { useMemo, useState } from "react";
import { Clock, Loader2, Pencil, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDialog, EmptyState, Field, NativeSelect, PageHeader, Panel, StatCard } from "@/components/common";
import { useAuth } from "@/context/AuthContext";
import { api, errMsg, qs, useApi } from "@/lib/api";
import { currentPeriod, eur, fmtDate, todayISO } from "@/lib/constants";
import { cn } from "@/lib/utils";

const EMPTY = { client_id: "", task_id: "", date: todayISO(), description: "", mode: "ore", hours: "", fixed_cost: "", user_id: "" };

function LogForm({ editing, onDone, clients, tasks, users, isAdmin }) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [lastEdit, setLastEdit] = useState(null);
  if (editing && editing !== lastEdit) {
    setLastEdit(editing);
    setForm({ ...EMPTY, ...Object.fromEntries(Object.entries(editing).map(([k, v]) => [k, v ?? ""])), mode: editing.fixed_cost != null ? "prestazione" : "ore" });
  }
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const pickTask = (e) => {
    const t = tasks.find((x) => String(x.id) === e.target.value);
    setForm((f) => ({ ...f, task_id: e.target.value, client_id: t?.client_id ? String(t.client_id) : f.client_id, description: f.description || t?.title || "" }));
  };
  const reset = () => { setForm(EMPTY); setLastEdit(null); onDone(false); };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const body = {
      client_id: form.client_id ? Number(form.client_id) : null, task_id: form.task_id ? Number(form.task_id) : null,
      date: form.date, description: form.description,
      hours: form.mode === "ore" ? Number(form.hours) || 0 : Number(form.hours) || 0,
      fixed_cost: form.mode === "prestazione" ? Number(form.fixed_cost) : null,
      user_id: form.user_id ? Number(form.user_id) : null,
    };
    try {
      if (editing) await api.put(`/worklogs/${editing.id}`, body);
      else await api.post("/worklogs", body);
      toast.success(editing ? "Log aggiornato" : "Lavoro registrato");
      setForm(EMPTY);
      setLastEdit(null);
      onDone(true);
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel title={editing ? "Modifica log" : "Registra lavoro svolto"} testId="worklog-form-panel"
      action={editing && <Button size="sm" variant="ghost" onClick={reset} data-testid="worklog-cancel-edit"><X className="h-4 w-4" /></Button>}>
      <form onSubmit={submit} className="space-y-4">
        {isAdmin && (
          <Field label="Dipendente">
            <NativeSelect value={form.user_id} onChange={set("user_id")} data-testid="worklog-user-select">
              <option value="">Io</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </NativeSelect>
          </Field>
        )}
        <Field label="Task svolto (opzionale)">
          <NativeSelect value={form.task_id} onChange={pickTask} data-testid="worklog-task-select">
            <option value="">— Nessun task specifico —</option>
            {tasks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
          </NativeSelect>
        </Field>
        <Field label="Cliente">
          <NativeSelect value={form.client_id} onChange={set("client_id")} data-testid="worklog-client-select">
            <option value="">Interno / nessuno</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </NativeSelect>
        </Field>
        <Field label="Descrizione attività *"><Textarea required value={form.description} onChange={set("description")} placeholder="es. Montaggio e color grading reel" data-testid="worklog-description-input" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Data *"><Input type="date" required value={form.date} onChange={set("date")} data-testid="worklog-date-input" /></Field>
          <Field label="Modalità">
            <NativeSelect value={form.mode} onChange={set("mode")} data-testid="worklog-mode-select">
              <option value="ore">Ore impiegate</option>
              <option value="prestazione">Costo a prestazione</option>
            </NativeSelect>
          </Field>
          <Field label={form.mode === "ore" ? "Ore *" : "Ore (facoltative)"}><Input type="number" step="0.25" min={0} max={24} required={form.mode === "ore"} value={form.hours} onChange={set("hours")} data-testid="worklog-hours-input" /></Field>
          {form.mode === "prestazione" && <Field label="Importo (€) *"><Input type="number" step="0.01" min={0} required value={form.fixed_cost} onChange={set("fixed_cost")} data-testid="worklog-cost-input" /></Field>}
        </div>
        <Button type="submit" disabled={saving} className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-700" data-testid="log-hours-submit-button">
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{editing ? "Salva modifiche" : "Registra"}
        </Button>
      </form>
    </Panel>
  );
}

export default function WorkLogs() {
  const { user, isAdmin } = useAuth();
  const [period, setPeriod] = useState(currentPeriod());
  const [userFilter, setUserFilter] = useState("");
  const [editing, setEditing] = useState(null);
  const [y, m] = period.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  const { data: logs, reload } = useApi(`/worklogs${qs({ date_from: `${period}-01`, date_to: `${period}-${String(last).padStart(2, "0")}`, user_id: userFilter })}`);
  const { data: clients } = useApi("/clients/basic");
  const { data: users } = useApi(isAdmin ? "/users/basic" : null);
  const { data: tasks } = useApi(isAdmin ? "/tasks?status=da_fare,in_corso,in_revisione,completato" : "/tasks?mine=true");

  const totals = useMemo(() => (logs || []).reduce((a, l) => ({ hours: a.hours + (l.hours || 0), cost: a.cost + (l.cost || 0) }), { hours: 0, cost: 0 }), [logs]);

  const remove = async (l) => {
    try {
      await api.delete(`/worklogs/${l.id}`);
      toast.success("Log eliminato");
      reload();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  return (
    <div data-testid="worklogs-page">
      <PageHeader eyebrow="Report team" title="Log lavori" subtitle={isAdmin ? "Tutte le attività registrate dal team: alimentano i costi in dashboard." : "Registra a fine giornata o a fine task cosa hai fatto e quanto tempo ti ha richiesto."} />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[380px_1fr]">
        <LogForm editing={editing} onDone={(saved) => { setEditing(null); if (saved) reload(); }} clients={clients || []} tasks={tasks || []} users={users || []} isAdmin={isAdmin} />
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Input type="month" value={period} onChange={(e) => e.target.value && setPeriod(e.target.value)} className="w-44 bg-white" data-testid="worklog-period-input" />
            {isAdmin && (
              <NativeSelect value={userFilter} onChange={(e) => setUserFilter(e.target.value)} className="w-52" data-testid="worklog-user-filter">
                <option value="">Tutto il team</option>
                {(users || []).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </NativeSelect>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <StatCard label="Ore nel periodo" value={`${totals.hours.toFixed(2)} h`} icon={Clock} tone="amber" testId="worklog-total-hours" />
            <StatCard label={isAdmin ? "Costo team" : "Il mio compenso"} value={eur(totals.cost)} tone="rose" testId="worklog-total-cost" />
          </div>
          {!logs?.length ? <EmptyState icon={Clock} title="Nessun log nel periodo" text="I lavori registrati appariranno qui." testId="worklogs-empty" /> : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white shadow-sm">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    {isAdmin && <TableHead>Dipendente</TableHead>}
                    <TableHead>Cliente</TableHead>
                    <TableHead>Attività</TableHead>
                    <TableHead className="text-right">Ore</TableHead>
                    <TableHead className="text-right">Costo</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((l) => (
                    <TableRow key={l.id} data-testid={`worklog-row-${l.id}`} className={cn(editing?.id === l.id && "bg-indigo-50/50")}>
                      <TableCell className="font-num whitespace-nowrap text-xs">{fmtDate(l.date)}</TableCell>
                      {isAdmin && <TableCell className="text-sm font-medium">{l.user_name}</TableCell>}
                      <TableCell className="text-sm">{l.client_name || "—"}</TableCell>
                      <TableCell className="max-w-xs text-sm"><p className="truncate">{l.description}</p>{l.task_title && <p className="truncate text-xs text-slate-400">{l.task_title}</p>}</TableCell>
                      <TableCell className="font-num text-right text-sm">{l.hours || "—"}</TableCell>
                      <TableCell className="font-num text-right text-sm">{eur(l.cost)}{l.fixed_cost != null && <span className="block text-[10px] text-slate-400">a prestazione</span>}</TableCell>
                      <TableCell className="whitespace-nowrap text-right">
                        {(isAdmin || l.user_id === user.id) && <>
                          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditing(l)} data-testid={`edit-worklog-${l.id}`}><Pencil className="h-4 w-4" /></Button>
                          <ConfirmDialog testId={`delete-worklog-${l.id}`} title="Eliminare il log?" onConfirm={() => remove(l)}
                            trigger={<Button size="icon" variant="ghost" className="h-8 w-8 text-rose-600" data-testid={`delete-worklog-btn-${l.id}`}><Trash2 className="h-4 w-4" /></Button>} />
                        </>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
