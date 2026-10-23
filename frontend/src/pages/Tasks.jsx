import { useMemo, useState } from "react";
import { CalendarClock, Hand, Plus, Search, Undo2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Chip, Loading, NativeSelect, PageHeader } from "@/components/common";
import TaskFormDialog from "@/pages/TaskFormDialog";
import CompleteTaskDialog from "@/pages/CompleteTaskDialog";
import { useAuth } from "@/context/AuthContext";
import { api, errMsg, useApi } from "@/lib/api";
import { fmtDate, initials, PRIORITY, TASK_STATUSES, todayISO } from "@/lib/constants";
import { cn } from "@/lib/utils";

function TaskCard({ t, me, isAdmin, onClaim, onRelease, onMove, onEdit, onComplete }) {
  const mine = t.assignee_id === me.id;
  const canEdit = isAdmin || mine || t.created_by === me.id;
  const late = t.due_date && t.status !== "completato" && t.due_date < todayISO();
  return (
    <div draggable={canEdit} onDragStart={(e) => e.dataTransfer.setData("text/plain", String(t.id))} data-testid={`task-card-${t.id}`}
      className={cn("rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm transition-shadow hover:shadow-md", canEdit && "cursor-grab active:cursor-grabbing")}>
      <div className="mb-2 flex items-center gap-1.5">
        <Chip className={(PRIORITY[t.priority] || PRIORITY.media).chip}>{(PRIORITY[t.priority] || PRIORITY.media).label}</Chip>
        {t.auto_generated && <Chip className="border-indigo-200 bg-indigo-50 text-indigo-700"><Wand2 className="h-3 w-3" />Piano ed.</Chip>}
      </div>
      <button onClick={() => canEdit && onEdit(t)} className="block text-left text-sm font-semibold text-slate-800 hover:text-indigo-700" data-testid={`task-title-${t.id}`}>{t.title}</button>
      {t.description && <p className="mt-1 line-clamp-2 text-xs text-slate-500">{t.description}</p>}
      <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
        <span className={cn("flex items-center gap-1", late && "font-semibold text-rose-600")}><CalendarClock className="h-3.5 w-3.5" />{fmtDate(t.due_date)}</span>
        {t.assignee_name ? (
          <span className="flex items-center gap-1.5" data-testid={`task-assignee-${t.id}`}>
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-[10px] font-bold text-indigo-700">{initials(t.assignee_name)}</span>
            {mine ? "Tu" : t.assignee_name.split(" ")[0]}
          </span>
        ) : <span className="italic">Non assegnato</span>}
      </div>
      <div className="mt-3 flex gap-2 border-t border-slate-100 pt-3">
        {t.status !== "completato" && (
          <Button size="sm" onClick={() => onComplete(t)} className="h-8 flex-1 rounded-lg bg-emerald-600 text-xs hover:bg-emerald-700" data-testid={`complete-task-${t.id}`}>
            Completa
          </Button>
        )}
        {!t.assignee_id && t.status !== "completato" && (
          <Button size="sm" onClick={() => onClaim(t)} className="h-8 flex-1 rounded-lg bg-indigo-600 text-xs hover:bg-indigo-700" data-testid={`take-charge-button-task-${t.id}`}>
            <Hand className="mr-1.5 h-3.5 w-3.5" />Prendi in carico
          </Button>
        )}
        {canEdit && (
          <NativeSelect value={t.status} onChange={(e) => onMove(t, e.target.value)} className="h-8 flex-1 text-xs" data-testid={`task-status-change-${t.id}`}>
            {TASK_STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </NativeSelect>
        )}
        {(mine || (isAdmin && t.assignee_id)) && t.status !== "completato" && (
          <Button size="icon" variant="ghost" className="h-8 w-8" title="Rilascia" onClick={() => onRelease(t)} data-testid={`release-task-${t.id}`}><Undo2 className="h-4 w-4" /></Button>
        )}
      </div>
    </div>
  );
}

export default function Tasks() {
  const { user, isAdmin } = useAuth();
  const { data: tasks, loading, reload, setData } = useApi("/tasks");
  const { data: clients } = useApi("/clients/basic");
  const { data: users } = useApi("/users/basic");
  const [filter, setFilter] = useState({ q: "", client: "", scope: "tutti" });
  const [dialog, setDialog] = useState({ open: false, task: null });
  const [over, setOver] = useState(null);

  const visible = useMemo(() => (tasks || []).filter((t) =>
    t.title.toLowerCase().includes(filter.q.toLowerCase()) &&
    (!filter.client || String(t.client_id) === filter.client) &&
    (filter.scope === "tutti" || (filter.scope === "miei" ? t.assignee_id === user.id : !t.assignee_id))), [tasks, filter, user.id]);

  const replace = (nt) => setData((list) => list.map((x) => (x.id === nt.id ? nt : x)));
  const act = async (fn, ok) => {
    try {
      const { data } = await fn();
      replace(data);
      if (ok) toast.success(ok);
    } catch (e) {
      toast.error(errMsg(e));
      reload();
    }
  };
  const claim = (t) => act(() => api.post(`/tasks/${t.id}/claim`), "Task preso in carico");
  const release = (t) => act(() => api.post(`/tasks/${t.id}/release`), "Task rilasciato");
  const move = (t, status) => {
    if (t.status === status) return;
    if (status === "completato") {
    setDialog({ open: true, task: t, complete: true });
    return;
    }
    act(() => api.put(`/tasks/${t.id}`, { status }), status === "completato" ? "Task completato" : null);
  };
  const drop = (status) => (e) => {
    e.preventDefault();
    setOver(null);
    const t = (tasks || []).find((x) => String(x.id) === e.dataTransfer.getData("text/plain"));
    if (t) move(t, status);
  };

  return (
    <div data-testid="tasks-page">
      <PageHeader eyebrow="Hub operativo" title="WORK TO DO" subtitle="Gestisci lavori e attività in un unico flusso. Il prezzo è sempre l'entrata pattuita col cliente; il compenso si registra solo alla chiusura."
        actions={<Button onClick={() => setDialog({ open: true, task: null, complete: false })} className="rounded-xl bg-indigo-600 hover:bg-indigo-700" data-testid="add-task-button"><Plus className="mr-2 h-4 w-4" />Nuovo lavoro / attività</Button>} />
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative md:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input placeholder="Cerca task..." value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} className="bg-white pl-9" data-testid="tasks-search-input" />
        </div>
        <NativeSelect value={filter.client} onChange={(e) => setFilter({ ...filter, client: e.target.value })} className="md:w-52" data-testid="tasks-client-filter">
          <option value="">Tutti i clienti</option>
          {(clients || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </NativeSelect>
        <div className="inline-flex rounded-xl bg-slate-200/60 p-1">
          {[["tutti", "Tutti"], ["miei", "I miei"], ["liberi", "Da prendere"]].map(([k, l]) => (
            <button key={k} onClick={() => setFilter({ ...filter, scope: k })} data-testid={`tasks-scope-${k}`}
              className={cn("rounded-lg px-3 py-1.5 text-sm font-semibold", filter.scope === k ? "bg-white shadow-sm" : "text-slate-500")}>{l}</button>
          ))}
        </div>
      </div>
      {loading && !tasks ? <Loading /> : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {TASK_STATUSES.filter((s) => s.key !== "completato").map((s) => {
            const col = visible.filter((t) => t.status === s.key);
            return (
              <div key={s.key} onDragOver={(e) => { e.preventDefault(); setOver(s.key); }} onDragLeave={() => setOver(null)} onDrop={drop(s.key)}
                data-testid={`kanban-column-${s.key.replace("_", "-")}`}
                className={cn("flex min-h-[520px] flex-col rounded-2xl bg-slate-100/70 p-3 transition-colors", over === s.key && "bg-indigo-50 ring-2 ring-indigo-300")}>
                <div className="mb-3 flex items-center justify-between px-1">
                  <span className="flex items-center gap-2 text-sm font-bold text-slate-700"><span className={cn("h-2 w-2 rounded-full", s.bar)} />{s.label}</span>
                  <span className="font-num rounded-md bg-white px-2 py-0.5 text-xs font-bold text-slate-500" data-testid={`kanban-count-${s.key}`}>{col.length}</span>
                </div>
                <div className="space-y-3">
                  {col.map((t) => <TaskCard key={t.id} t={t} me={user} isAdmin={isAdmin} onClaim={claim} onRelease={release} onMove={move} onComplete={(task) => setDialog({ open: true, task, complete: true })} onEdit={(task) => setDialog({ open: true, task, complete: false, singleJob: false })} />)}
                  {col.length === 0 && <p className="py-8 text-center text-xs text-slate-400">Nessun task</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <TaskFormDialog open={dialog.open && !dialog.complete} onOpenChange={(o) => setDialog((d) => ({ ...d, open: o }))} task={dialog.task} clients={clients || []} users={users || []} onSaved={reload} />
      <CompleteTaskDialog task={dialog.task} open={dialog.open && dialog.complete} onOpenChange={(o) => setDialog((d) => ({ ...d, open: o }))} users={users || []} onCompleted={reload} />
    </div>
  );
}
