import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, CalendarClock, CheckCircle2, Loader2, Pencil, PiggyBank, Plus, Search, Trash2,
  TrendingUp, Undo2, UserCog, Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Chip, ConfirmDialog, EmptyState, Field, Loading, NativeSelect, PageHeader, Panel, StatCard } from "@/components/common";
import { useAuth } from "@/context/AuthContext";
import { api, errMsg, useApi } from "@/lib/api";
import { currentPeriod, eur, fmtDate, initials, periodLabel } from "@/lib/constants";

const EMPTY = { name: "", email: "", role: "dipendente", password: "", phone: "", job_title: "", hourly_rate: 0, monthly_salary: 0, active: true };
const LOG_EMPTY = { client_id: "", date: "", description: "", notes: "", worker_payout: 0, client_revenue: 0, team_paid: false };
const STATUS_TABS = [
  { key: "pending", label: "Da saldare" },
  { key: "paid", label: "Già saldati" },
  { key: "all", label: "Tutti" },
];

/* ------------------------------------------------------------------ Dialog: modifica lavoro */

export function WorkLogDialog({ open, onOpenChange, log, clients, onDone }) {
  const [form, setForm] = useState(LOG_EMPTY);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setForm(log ? { ...LOG_EMPTY, ...log, notes: log.notes || "", client_id: log.client_id ?? "", date: log.date?.slice(0, 10) || "" } : LOG_EMPTY);
  }, [open, log]);
  const set = (key) => (event) => setForm((value) => ({ ...value, [key]: event.target.value }));
  const margin = (Number(form.client_revenue) || 0) - (Number(form.worker_payout) || 0);
  const submit = async (event) => {
    event.preventDefault(); setBusy(true);
    try {
      // Si inviano solo i campi del form: lo stato di saldo viene inviato in modo esplicito.
      await api.put(`/work-logs/${log.id}`, {
        client_id: form.client_id ? Number(form.client_id) : null,
        date: form.date, description: form.description, notes: form.notes || "",
        worker_payout: Number(form.worker_payout) || 0, client_revenue: Number(form.client_revenue) || 0,
        team_paid: !!form.team_paid,
      });
      toast.success("Lavoro aggiornato"); onDone(); onOpenChange(false);
    } catch (error) { toast.error(errMsg(error)); } finally { setBusy(false); }
  };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="mx-4 max-h-[90vh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto p-4 sm:p-6">
    <DialogHeader><DialogTitle>Modifica lavoro registrato</DialogTitle></DialogHeader>
    <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field label="Cliente"><NativeSelect value={form.client_id} onChange={set("client_id")}><option value="">Nessun cliente</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</NativeSelect></Field>
      <Field label="Data"><Input required type="date" value={form.date} onChange={set("date")} /></Field>
      <Field label="Titolo / attività" className="sm:col-span-2"><Input required value={form.description} onChange={set("description")} /></Field>
      <Field label="Entrata cliente (€)"><Input type="number" min="0" step="0.01" value={form.client_revenue} onChange={set("client_revenue")} /></Field>
      <Field label="Compenso collaboratore (€)"><Input type="number" min="0" step="0.01" value={form.worker_payout} onChange={set("worker_payout")} /></Field>
      <p className={`text-xs font-semibold sm:col-span-2 ${margin < 0 ? "text-rose-600" : "text-slate-500"}`}>Margine agenzia su questo lavoro: <span className="font-num">{eur(margin)}</span></p>
      <Field label="Note" className="sm:col-span-2"><Input value={form.notes || ""} onChange={set("notes")} /></Field>
      <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 sm:col-span-2">
        <input type="checkbox" checked={!!form.team_paid} onChange={(e) => setForm((f) => ({ ...f, team_paid: e.target.checked }))} />
        Compenso già saldato al collaboratore
      </label>
      <DialogFooter className="sm:col-span-2"><Button disabled={busy} type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 sm:w-auto">{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salva modifiche</Button></DialogFooter>
    </form>
  </DialogContent></Dialog>;
}

/* ------------------------------------------------------------------ Dialog: membro */

function UserDialog({ open, onOpenChange, member, onDone }) {
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setForm(member ? { ...EMPTY, ...Object.fromEntries(Object.keys(EMPTY).map((k) => [k, member[k] ?? EMPTY[k]])), password: "" } : EMPTY); }, [open, member]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    const body = { ...form, hourly_rate: Number(form.hourly_rate) || 0, monthly_salary: Number(form.monthly_salary) || 0, password: form.password || null };
    try {
      if (member) await api.put(`/users/${member.id}`, body);
      else await api.post("/users", body);
      toast.success(member ? "Utente aggiornato" : "Utente creato");
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
      <DialogContent className="mx-4 max-h-[90vh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto p-4 sm:p-6" data-testid="user-dialog">
        <DialogHeader><DialogTitle>{member ? "Modifica membro" : "Nuovo membro del team"}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Nome *" className="sm:col-span-2"><Input required value={form.name} onChange={set("name")} data-testid="user-name-input" /></Field>
          <Field label="Email *"><Input type="email" required value={form.email} onChange={set("email")} data-testid="user-email-input" /></Field>
          <Field label="Ruolo">
            <NativeSelect value={form.role} onChange={set("role")} data-testid="user-role-select">
              <option value="dipendente">Dipendente</option><option value="admin">Amministratore</option>
            </NativeSelect>
          </Field>
          <Field label={member ? "Nuova password" : "Password *"} hint={member ? "Lascia vuoto per non cambiarla" : "Minimo 8 caratteri"}>
            <Input type="password" minLength={8} required={!member} value={form.password} onChange={set("password")} data-testid="user-password-input" />
          </Field>
          <Field label="Mansione"><Input value={form.job_title} onChange={set("job_title")} placeholder="es. Video editor" data-testid="user-job-input" /></Field>
          <Field label="Tariffa oraria (€)" hint="Usata solo per i lavori registrati a ore"><Input type="number" step="0.5" min={0} value={form.hourly_rate} onChange={set("hourly_rate")} data-testid="user-rate-input" /></Field>
          <Field label="Stipendio mensile (€)" hint="Facoltativo, solo riferimento"><Input type="number" step="1" min={0} value={form.monthly_salary} onChange={set("monthly_salary")} data-testid="user-salary-input" /></Field>
          <Field label="Telefono"><Input value={form.phone} onChange={set("phone")} data-testid="user-phone-input" /></Field>
          {member && <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={!!form.active} onChange={set("active")} data-testid="user-active-checkbox" />Account attivo</label>}
          <DialogFooter className="sm:col-span-2">
            <Button type="submit" disabled={busy} className="w-full bg-indigo-600 hover:bg-indigo-700 sm:w-auto" data-testid="user-form-submit">
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{member ? "Salva" : "Crea account"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ Card membro */

function MemberCard({ member, selected, isSelf, onSelect, onEdit, onRemove, period }) {
  const owes = member.pending_payout > 0;
  return (
    <div
      role="button" tabIndex={0}
      onClick={onSelect} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect()}
      className={`group flex cursor-pointer flex-col rounded-2xl border bg-white p-4 shadow-sm transition-all hover:shadow-md ${selected ? "border-indigo-500 ring-2 ring-indigo-100" : "border-slate-200/80"} ${member.active ? "" : "opacity-60"}`}
      data-testid={`team-row-${member.id}`}
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-700">{initials(member.name)}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-slate-900">{member.name}</p>
          <p className="truncate text-xs text-slate-500">{member.job_title || member.email}</p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            <Chip className={member.role === "admin" ? "border-indigo-200 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-slate-50 text-slate-600"}>{member.role === "admin" ? "Admin" : "Dipendente"}</Chip>
            {!member.active && <Chip className="border-slate-200 bg-slate-100 text-slate-500">Disattivo</Chip>}
            {member.zero_payout_count > 0 && <Chip className="border-amber-200 bg-amber-50 text-amber-700"><AlertTriangle className="h-3 w-3" />{member.zero_payout_count} senza compenso</Chip>}
          </div>
        </div>
        <div className="flex shrink-0 gap-0.5 opacity-70 group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onEdit} aria-label="Modifica membro" data-testid={`edit-user-${member.id}`}><Pencil className="h-4 w-4" /></Button>
          {!isSelf && (
            <ConfirmDialog testId={`delete-user-${member.id}`} title={`Rimuovere ${member.name}?`} description="Se ha lavori registrati l'account verrà solo disattivato per preservare lo storico."
              onConfirm={onRemove} trigger={<Button size="icon" variant="ghost" className="h-8 w-8 text-rose-600" aria-label="Rimuovi membro" data-testid={`delete-user-btn-${member.id}`}><Trash2 className="h-4 w-4" /></Button>} />
          )}
        </div>
      </div>

      <div className={`mt-4 rounded-xl px-3 py-2.5 ${owes ? "bg-amber-50" : "bg-emerald-50"}`}>
        <p className={`text-[11px] font-semibold uppercase tracking-wider ${owes ? "text-amber-700" : "text-emerald-700"}`}>{owes ? "Da saldare" : "Tutto saldato"}</p>
        <p className="font-num text-xl font-bold text-slate-900">{eur(member.pending_payout)}</p>
        <p className="text-xs text-slate-500">{member.pending_count} lavor{member.pending_count === 1 ? "o" : "i"} aperti · {eur(member.paid_total)} già pagati</p>
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div><dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Lavori</dt><dd className="font-num text-sm font-bold text-slate-800">{member.month_jobs}</dd></div>
        <div><dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Costo</dt><dd className="font-num text-sm font-bold text-slate-800">{eur(member.month_cost)}</dd></div>
        <div><dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Margine</dt><dd className={`font-num text-sm font-bold ${member.month_margin < 0 ? "text-rose-600" : "text-slate-800"}`}>{eur(member.month_margin)}</dd></div>
      </dl>
      <p className="mt-2 text-center text-[11px] text-slate-400">
        {periodLabel(period, true)}{member.month_hours ? ` · ${member.month_hours} h` : ""}{member.hourly_rate ? ` · ${eur(member.hourly_rate)}/h` : ""}
        {member.last_log_date && ` · ultimo lavoro ${fmtDate(member.last_log_date)}`}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ Registro compensi */

function CompensationTable({ logs, showMember, selectedIds, onToggleSelect, onToggleAll, busyId, onTogglePaid, onEdit, onDelete }) {
  const groups = useMemo(() => {
    const map = new Map();
    logs.forEach((log) => {
      const key = (log.date || "").slice(0, 7);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(log);
    });
    return [...map.entries()];
  }, [logs]);
  const selectable = logs.filter((l) => !l.team_paid);
  const allChecked = selectable.length > 0 && selectable.every((l) => selectedIds.has(l.id));

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200">
      <table className="w-full table-fixed text-sm">
        <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
          <tr>
            <th className="w-10 px-3 py-2.5">
              <input type="checkbox" aria-label="Seleziona tutti i lavori da saldare" checked={allChecked} disabled={!selectable.length} onChange={() => onToggleAll(selectable, !allChecked)} />
            </th>
            <th className="w-24 px-2 py-2.5">Data</th>
            {showMember && <th className="hidden w-32 px-2 py-2.5 lg:table-cell">Collaboratore</th>}
            <th className="px-2 py-2.5">Lavoro</th>
            <th className="hidden w-28 px-2 py-2.5 text-right md:table-cell">Entrata</th>
            <th className="w-28 px-2 py-2.5 text-right">Compenso</th>
            <th className="w-[96px] px-2 py-2.5 xl:w-[140px]" />
          </tr>
        </thead>
        <tbody>
          {groups.map(([month, rows]) => {
            const subtotal = rows.reduce((s, r) => s + (r.worker_payout || 0), 0);
            return [
              <tr key={`m-${month}`} className="border-t border-slate-200 bg-slate-50/60">
                <td colSpan={showMember ? 7 : 6} className="px-3 py-1.5">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
                    <span className="capitalize">{month ? periodLabel(month, true) : "Senza data"} · {rows.length} lavor{rows.length === 1 ? "o" : "i"}</span>
                    <span className="font-num">{eur(subtotal)}</span>
                  </div>
                </td>
              </tr>,
              ...rows.map((log) => {
                const zero = !log.team_paid && (log.worker_payout || 0) <= 0;
                return (
                  <tr key={log.id} className={`border-t border-slate-100 align-top transition-colors ${selectedIds.has(log.id) ? "bg-indigo-50/60" : "hover:bg-slate-50/70"}`}>
                    <td className="px-3 py-3">
                      {!log.team_paid && <input type="checkbox" aria-label="Seleziona lavoro" checked={selectedIds.has(log.id)} onChange={() => onToggleSelect(log.id)} />}
                    </td>
                    <td className="px-2 py-3 font-num text-xs text-slate-600">{fmtDate(log.date)}</td>
                    {showMember && <td className="hidden truncate px-2 py-3 text-slate-700 lg:table-cell">{log.user_name || "—"}</td>}
                    <td className="min-w-0 px-2 py-3">
                      <p className={`break-words font-medium ${log.team_paid ? "text-slate-500" : "text-slate-900"}`}>{log.task_title || log.description}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                        <span>{log.client_name || "Nessun cliente"}</span>
                        {showMember && <span className="lg:hidden">· {log.user_name}</span>}
                        {log.team_paid && <Chip className="border-emerald-200 bg-emerald-50 text-emerald-700">Saldato</Chip>}
                        {zero && <Chip className="border-amber-200 bg-amber-50 text-amber-700">Compenso da inserire</Chip>}
                      </p>
                    </td>
                    <td className="hidden px-2 py-3 text-right font-num text-slate-600 md:table-cell">{eur(log.client_revenue)}</td>
                    <td className={`px-2 py-3 text-right font-num font-bold ${log.team_paid ? "text-slate-400" : zero ? "text-amber-600" : "text-slate-900"}`}>{eur(log.worker_payout)}</td>
                    <td className="px-2 py-2">
                      <div className="flex items-center justify-end gap-0.5">
                        <Button
                          size="sm" variant="ghost" disabled={busyId === log.id}
                          className={`h-8 px-2 text-xs ${log.team_paid ? "text-slate-500" : "text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"}`}
                          onClick={() => onTogglePaid(log)} title={log.team_paid ? "Annulla saldo" : "Segna come saldato"}
                          data-testid={`toggle-team-paid-${log.id}`}
                        >
                          {busyId === log.id ? <Loader2 className="h-4 w-4 animate-spin" /> : log.team_paid ? <Undo2 className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                          <span className="ml-1 hidden xl:inline">{log.team_paid ? "Annulla" : "Salda"}</span>
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(log)} aria-label="Modifica lavoro"><Pencil className="h-4 w-4" /></Button>
                        <ConfirmDialog title="Eliminare il lavoro?" description="Il record verrà rimosso anche dai totali contabili." onConfirm={() => onDelete(log)}
                          trigger={<Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Elimina lavoro"><Trash2 className="h-4 w-4 text-rose-500" /></Button>} />
                      </div>
                    </td>
                  </tr>
                );
              }),
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ Pagina */

export default function Team() {
  const { user } = useAuth();
  const [period, setPeriod] = useState(currentPeriod());
  const [year, month] = period.split("-").map(Number);
  const { data: members, loading, reload } = useApi(`/users?year=${year}&month=${month}`);
  const { data: clients } = useApi("/clients/basic");
  const [selectedUser, setSelectedUser] = useState("");
  const { data: logs, loading: logsLoading, reload: reloadLogs } = useApi(`/work-logs${selectedUser ? `?user_id=${selectedUser}` : ""}`);
  const [status, setStatus] = useState("pending");
  const [logPeriod, setLogPeriod] = useState("");
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [dialog, setDialog] = useState({ open: false, member: null });
  const [logDialog, setLogDialog] = useState({ open: false, log: null });
  const [paidBusyId, setPaidBusyId] = useState(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  useEffect(() => { setSelectedIds(new Set()); }, [selectedUser, status, logPeriod, query]);

  const refreshAll = async () => { await Promise.all([reloadLogs(), reload()]); };

  const remove = async (u) => {
    try {
      const r = await api.delete(`/users/${u.id}`);
      toast.success(r.data.deactivated ? "Utente disattivato (ha lavori registrati)" : "Utente eliminato");
      if (String(u.id) === selectedUser) setSelectedUser("");
      reload();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  const togglePaid = async (log) => {
    setPaidBusyId(log.id);
    try {
      const { data: updated } = await api.put(`/work-logs/${log.id}`, { team_paid: !log.team_paid });
      await refreshAll();
      toast.success(updated.team_paid ? "Compenso segnato come saldato" : "Saldo del compenso annullato");
    } catch (error) {
      toast.error(errMsg(error));
    } finally {
      setPaidBusyId(null);
    }
  };
  const deleteLog = async (log) => {
    try { await api.delete(`/work-logs/${log.id}`); await refreshAll(); toast.success("Lavoro eliminato"); } catch (e) { toast.error(errMsg(e)); }
  };
  const settleSelected = async () => {
    const ids = [...selectedIds];
    setBulkBusy(true);
    const results = await Promise.allSettled(ids.map((id) => api.put(`/work-logs/${id}`, { team_paid: true })));
    const failed = results.filter((r) => r.status === "rejected").length;
    setBulkBusy(false);
    setSelectedIds(new Set());
    await refreshAll();
    if (failed) toast.error(`${failed} compensi non aggiornati, riprova`);
    else toast.success(`${ids.length} compensi segnati come saldati`);
  };

  const allLogs = useMemo(() => logs || [], [logs]);
  const logPeriods = useMemo(() => [...new Set(allLogs.map((l) => (l.date || "").slice(0, 7)).filter(Boolean))].sort().reverse(), [allLogs]);
  const visibleLogs = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allLogs.filter((l) => {
      if (status === "pending" && l.team_paid) return false;
      if (status === "paid" && !l.team_paid) return false;
      if (logPeriod && !(l.date || "").startsWith(logPeriod)) return false;
      if (q && ![l.task_title, l.description, l.client_name, l.user_name].some((v) => (v || "").toLowerCase().includes(q))) return false;
      return true;
    });
  }, [allLogs, status, logPeriod, query]);
  const counts = useMemo(() => ({
    pending: allLogs.filter((l) => !l.team_paid).length,
    paid: allLogs.filter((l) => l.team_paid).length,
    all: allLogs.length,
  }), [allLogs]);
  const visibleTotal = visibleLogs.reduce((s, l) => s + (l.worker_payout || 0), 0);
  const selectedTotal = allLogs.filter((l) => selectedIds.has(l.id)).reduce((s, l) => s + (l.worker_payout || 0), 0);

  const team = members || [];
  const totals = team.reduce((t, m) => ({
    pending: t.pending + (m.pending_payout || 0), pendingCount: t.pendingCount + (m.pending_count || 0),
    cost: t.cost + (m.month_cost || 0), revenue: t.revenue + (m.month_revenue || 0), jobs: t.jobs + (m.month_jobs || 0),
    zero: t.zero + (m.zero_payout_count || 0),
  }), { pending: 0, pendingCount: 0, cost: 0, revenue: 0, jobs: 0, zero: 0 });
  const owing = team.filter((m) => m.pending_payout > 0).length;
  const selectedMember = team.find((m) => String(m.id) === selectedUser);

  const toggleSelect = (id) => setSelectedIds((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = (rows, on) => setSelectedIds((s) => { const n = new Set(s); rows.forEach((r) => (on ? n.add(r.id) : n.delete(r.id))); return n; });

  return (
    <div data-testid="team-page">
      <PageHeader
        eyebrow="Risorse"
        title="Team & compensi"
        subtitle="Quanto devi a ogni collaboratore, quanto è costato il team nel mese e quanto margine ha generato."
        actions={<>
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
            <label htmlFor="team-period" className="text-xs font-semibold uppercase tracking-wider text-slate-500">Mese</label>
            <Input id="team-period" type="month" value={period} onChange={(e) => e.target.value && setPeriod(e.target.value)} className="h-9 w-40 bg-white" data-testid="team-period-filter" />
          </div>
          <Button onClick={() => setDialog({ open: true, member: null })} className="rounded-xl bg-indigo-600 hover:bg-indigo-700" data-testid="add-user-button"><Plus className="mr-2 h-4 w-4" />Nuovo membro</Button>
        </>}
      />

      {/* KPI */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Da saldare al team" value={eur(totals.pending)} hint={`${totals.pendingCount} lavori aperti · ${owing} collaborator${owing === 1 ? "e" : "i"}`} icon={Wallet} tone={totals.pending ? "amber" : "slate"} testId="team-kpi-pending" />
        <StatCard label={`Costo team · ${periodLabel(period)}`} value={eur(totals.cost)} hint={`${totals.jobs} lavori registrati nel mese`} icon={CalendarClock} tone="rose" testId="team-kpi-cost" className="rise-1" />
        <StatCard label="Entrate generate" value={eur(totals.revenue)} hint="Valore fatturato dei lavori del mese" icon={TrendingUp} tone="emerald" testId="team-kpi-revenue" className="rise-2" />
        <StatCard label="Margine sui lavori" value={eur(totals.revenue - totals.cost)} hint={totals.revenue ? `${Math.round(((totals.revenue - totals.cost) / totals.revenue) * 100)}% delle entrate` : "Entrate − compensi"} icon={PiggyBank} tone="indigo" testId="team-kpi-margin" className="rise-3" />
      </div>

      {totals.zero > 0 && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p><b>{totals.zero} lavori da saldare hanno compenso a 0 €.</b> Probabilmente il compenso non è stato inserito alla chiusura del task: aprili con la matita e completa l'importo, altrimenti il costo del team risulta sottostimato.</p>
        </div>
      )}

      {/* Membri */}
      <section className="mb-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900">Membri del team</h2>
          {selectedUser && <button type="button" className="text-xs font-semibold text-indigo-600 hover:underline" onClick={() => setSelectedUser("")}>Mostra tutto il team</button>}
        </div>
        {loading && !members ? <Loading /> : !team.length ? <EmptyState icon={UserCog} title="Nessun membro" /> : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" data-testid="team-table">
            {team.map((m) => (
              <MemberCard key={m.id} member={m} period={period} isSelf={m.id === user?.id}
                selected={String(m.id) === selectedUser}
                onSelect={() => setSelectedUser((cur) => (cur === String(m.id) ? "" : String(m.id)))}
                onEdit={() => setDialog({ open: true, member: m })}
                onRemove={() => remove(m)} />
            ))}
          </div>
        )}
      </section>

      {/* Registro compensi */}
      <Panel title={selectedMember ? `Compensi · ${selectedMember.name}` : "Registro compensi"}
        action={<NativeSelect className="w-48" value={selectedUser} onChange={(e) => setSelectedUser(e.target.value)} aria-label="Filtra per collaboratore">
          <option value="">Tutto il team</option>{team.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </NativeSelect>}>
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="inline-flex rounded-xl bg-slate-100 p-1" role="tablist">
            {STATUS_TABS.map((t) => (
              <button key={t.key} type="button" role="tab" aria-selected={status === t.key} onClick={() => setStatus(t.key)}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${status === t.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                {t.label} <span className="ml-1 font-num text-xs text-slate-400">{counts[t.key]}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cerca lavoro o cliente" className="h-10 pl-9 sm:w-56" />
            </div>
            <NativeSelect className="sm:w-44" value={logPeriod} onChange={(e) => setLogPeriod(e.target.value)} aria-label="Filtra per mese">
              <option value="">Tutti i mesi</option>{logPeriods.map((p) => <option key={p} value={p}>{periodLabel(p, true)}</option>)}
            </NativeSelect>
          </div>
        </div>

        {selectedIds.size > 0 && (
          <div className="mb-3 flex flex-col gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-indigo-900"><b>{selectedIds.size}</b> selezionati · <span className="font-num font-bold">{eur(selectedTotal)}</span></p>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>Deseleziona</Button>
              <Button size="sm" disabled={bulkBusy} onClick={settleSelected} className="bg-emerald-600 text-white hover:bg-emerald-700">
                {bulkBusy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-4 w-4" />}Segna come saldati
              </Button>
            </div>
          </div>
        )}

        {logsLoading && !logs ? <Loading /> : !visibleLogs.length ? (
          <p className="py-8 text-center text-sm text-slate-500">{allLogs.length ? "Nessun lavoro corrisponde ai filtri." : "Nessun lavoro registrato."}</p>
        ) : (
          <>
            <CompensationTable logs={visibleLogs} showMember={!selectedUser} selectedIds={selectedIds}
              onToggleSelect={toggleSelect} onToggleAll={toggleAll} busyId={paidBusyId}
              onTogglePaid={togglePaid} onEdit={(log) => setLogDialog({ open: true, log })} onDelete={deleteLog} />
            <div className="mt-3 flex justify-end text-sm text-slate-600">
              Totale {status === "pending" ? "da saldare" : status === "paid" ? "saldato" : "compensi"} in elenco:&nbsp;<span className="font-num font-bold text-slate-900">{eur(visibleTotal)}</span>
            </div>
          </>
        )}
      </Panel>

      <UserDialog open={dialog.open} onOpenChange={(o) => setDialog((d) => ({ ...d, open: o }))} member={dialog.member} onDone={reload} />
      <WorkLogDialog open={logDialog.open} onOpenChange={(o) => setLogDialog((d) => ({ ...d, open: o }))} log={logDialog.log} clients={clients || []} onDone={refreshAll} />
    </div>
  );
}
