import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, Pencil, Plus, Trash2, Undo2, UserCog } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Chip, ConfirmDialog, EmptyState, Field, Loading, NativeSelect, PageHeader, Panel } from "@/components/common";
import { useAuth } from "@/context/AuthContext";
import { api, errMsg, useApi } from "@/lib/api";
import { eur, initials } from "@/lib/constants";

const EMPTY = { name: "", email: "", role: "dipendente", password: "", phone: "", job_title: "", hourly_rate: 0, monthly_salary: 0, active: true };
const LOG_EMPTY = { client_id: "", date: "", description: "", notes: "", worker_payout: 0, client_revenue: 0 };

export function WorkLogDialog({ open, onOpenChange, log, clients, onDone }) {
  const [form, setForm] = useState(LOG_EMPTY);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setForm(log ? { ...LOG_EMPTY, ...log, date: log.date?.slice(0, 10) || "" } : LOG_EMPTY); }, [open, log]);
  const set = (key) => (event) => setForm((value) => ({ ...value, [key]: event.target.value }));
  const submit = async (event) => {
    event.preventDefault(); setBusy(true);
    try {
      await api.put(`/work-logs/${log.id}`, { ...form, client_id: form.client_id ? Number(form.client_id) : null,
        worker_payout: Number(form.worker_payout) || 0, client_revenue: Number(form.client_revenue) || 0, team_paid: !!form.team_paid });
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
      <Field label="Note" className="sm:col-span-2"><Input value={form.notes || ""} onChange={set("notes")} /></Field>
      <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 sm:col-span-2">
        <input type="checkbox" checked={!!form.team_paid} onChange={(e) => setForm((f) => ({ ...f, team_paid: e.target.checked }))} />
        Segna come pagato al team
      </label>
      <DialogFooter className="sm:col-span-2"><Button disabled={busy} type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 sm:w-auto">{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salva modifiche</Button></DialogFooter>
    </form>
  </DialogContent></Dialog>;
}

function UserDialog({ open, onOpenChange, member, onDone }) {
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setForm(member ? { ...EMPTY, ...Object.fromEntries(Object.entries(member).map(([k, v]) => [k, v ?? ""])), password: "" } : EMPTY); }, [open, member]);
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
          <Field label="Tariffa oraria (€)" hint="Usata per calcolare il costo dei log"><Input type="number" step="0.5" min={0} value={form.hourly_rate} onChange={set("hourly_rate")} data-testid="user-rate-input" /></Field>
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

function CompensationList({ title, logs, paid, busyId, onTogglePaid, onEdit, onDelete }) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-2 sm:p-3">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-bold text-slate-700">{title}</h4>
        <Chip className={paid ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}>
          {logs.length}
        </Chip>
      </div>
      {!logs.length ? <p className="py-3 text-sm text-slate-400">Nessun compenso in questa sezione.</p> : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Cliente</TableHead><TableHead>Attività</TableHead><TableHead>Data</TableHead><TableHead className="text-right">Compenso</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>{logs.map((log) => (
              <TableRow key={log.id} className={paid ? "opacity-60" : "bg-amber-50/30"}>
                <TableCell>{log.client_name || "—"}</TableCell>
                <TableCell className={paid ? "line-through" : ""}>{log.task_title || log.description}</TableCell>
                <TableCell>{log.date}</TableCell>
                <TableCell className={`text-right font-num font-bold ${paid ? "line-through" : ""}`}>{eur(log.worker_payout)}</TableCell>
                <TableCell className="whitespace-nowrap text-right">
                  <Button
                    size="sm"
                    variant={paid ? "ghost" : "default"}
                    disabled={busyId === log.id}
                    className={paid ? "h-8 text-slate-500" : "h-8 bg-emerald-600 text-white hover:bg-emerald-700"}
                    onClick={() => onTogglePaid(log)}
                    data-testid={`toggle-team-paid-${log.id}`}
                  >
                    {busyId === log.id ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : paid ? <Undo2 className="mr-1.5 h-3.5 w-3.5" /> : <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />}
                    {paid ? "Annulla saldo" : "Segna come saldato"}
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => onEdit(log)}><Pencil className="h-4 w-4" /></Button>
                  <ConfirmDialog title="Eliminare il lavoro?" description="Il record verrà rimosso anche dai totali contabili." onConfirm={() => onDelete(log)} trigger={<Button variant="ghost" size="icon"><Trash2 className="h-4 w-4 text-rose-500" /></Button>} />
                </TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

export default function Team() {
  const { user } = useAuth();
  const { data, loading, reload } = useApi("/users");
  const { data: clients } = useApi("/clients/basic");
  const [selectedUser, setSelectedUser] = useState("");
  const { data: logs, reload: reloadLogs, setData } = useApi(`/work-logs${selectedUser ? `?user_id=${selectedUser}` : ""}`);
  const [dialog, setDialog] = useState({ open: false, member: null });
  const [logDialog, setLogDialog] = useState({ open: false, log: null });
  const [paidBusyId, setPaidBusyId] = useState(null);
  const remove = async (u) => {
    try {
      const r = await api.delete(`/users/${u.id}`);
      toast.success(r.data.deactivated ? "Utente disattivato (ha log registrati)" : "Utente eliminato");
      reload();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  const togglePaid = async (log) => {
    setPaidBusyId(log.id);
    try {
      const { data: updated } = await api.put(`/work-logs/${log.id}`, {
        team_paid: !Boolean(log.team_paid),
      });
      setData((current) => (current || []).map((item) => item.id === updated.id ? updated : item));
      toast.success(updated.team_paid ? "Compenso segnato come saldato" : "Saldo del compenso annullato");
    } catch (error) {
      toast.error(errMsg(error));
    } finally {
      setPaidBusyId(null);
    }
  };
  const groupedLogs = (logs || []).reduce((groups, log) => {
    const name = log.user_name || "Collaboratore non assegnato";
    groups[name] = groups[name] || [];
    groups[name].push(log);
    return groups;
  }, {});
  return (
    <div data-testid="team-page">
      <PageHeader eyebrow="Risorse" title="Team & compensi" subtitle="Account dei dipendenti, tariffe e costo maturato nel mese corrente dai log lavori."
        actions={<Button onClick={() => setDialog({ open: true, member: null })} className="rounded-xl bg-indigo-600 hover:bg-indigo-700" data-testid="add-user-button"><Plus className="mr-2 h-4 w-4" />Nuovo membro</Button>} />
      <Panel title="Storico lavori e compensi" className="mb-6" action={<NativeSelect className="w-52" value={selectedUser} onChange={(e) => setSelectedUser(e.target.value)}><option value="">Tutto il team</option>{(data || []).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</NativeSelect>}>
        {!logs?.length ? <p className="text-sm text-slate-500">Nessun lavoro registrato.</p> : <div className="space-y-6">{Object.entries(groupedLogs).map(([memberName, memberLogs]) => {
          const pending = memberLogs.filter((log) => !log.team_paid);
          const paid = memberLogs.filter((log) => log.team_paid);
          return <section key={memberName} className="space-y-3"><h3 className="text-base font-bold text-slate-900">{memberName}</h3><div className="grid gap-4 xl:grid-cols-2"><CompensationList title="Da saldare" logs={pending} paid={false} busyId={paidBusyId} onTogglePaid={togglePaid} onEdit={(log) => setLogDialog({ open: true, log })} onDelete={async (log) => { try { await api.delete(`/work-logs/${log.id}`); toast.success("Lavoro eliminato"); setData((current) => (current || []).filter((item) => item.id !== log.id)); } catch (e) { toast.error(errMsg(e)); } }} /><CompensationList title="Già saldati" logs={paid} paid busyId={paidBusyId} onTogglePaid={togglePaid} onEdit={(log) => setLogDialog({ open: true, log })} onDelete={async (log) => { try { await api.delete(`/work-logs/${log.id}`); toast.success("Lavoro eliminato"); setData((current) => (current || []).filter((item) => item.id !== log.id)); } catch (e) { toast.error(errMsg(e)); } }} /></div></section>;
        })}</div>}
      </Panel>
      {loading ? <Loading /> : !data?.length ? <EmptyState icon={UserCog} title="Nessun membro" /> : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white shadow-sm">
          <Table data-testid="team-table">
            <TableHeader>
              <TableRow>
                <TableHead>Membro</TableHead><TableHead>Ruolo</TableHead><TableHead className="text-right">Tariffa</TableHead>
                <TableHead className="text-right">Stipendio</TableHead><TableHead className="text-right">Ore mese</TableHead>
                <TableHead className="text-right">Costo mese</TableHead><TableHead className="text-right">Task completati</TableHead><TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((u) => (
                <TableRow key={u.id} data-testid={`team-row-${u.id}`} className={u.active ? "" : "opacity-50"}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">{initials(u.name)}</span>
                      <div><p className="font-semibold">{u.name}</p><p className="text-xs text-slate-500">{u.email}{u.job_title && ` · ${u.job_title}`}</p></div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Chip className={u.role === "admin" ? "border-indigo-200 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-slate-50 text-slate-600"}>{u.role === "admin" ? "Admin" : "Dipendente"}</Chip>
                    {!u.active && <Chip className="ml-1 border-slate-200 bg-slate-100 text-slate-500">Disattivo</Chip>}
                  </TableCell>
                  <TableCell className="font-num text-right text-sm">{eur(u.hourly_rate)}/h</TableCell>
                  <TableCell className="font-num text-right text-sm">{u.monthly_salary ? eur(u.monthly_salary) : "—"}</TableCell>
                  <TableCell className="font-num text-right text-sm">{u.month_hours}</TableCell>
                  <TableCell className="font-num text-right text-sm font-bold">{eur(u.month_cost)}</TableCell>
                  <TableCell className="font-num text-right text-sm">{u.month_completed}</TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setDialog({ open: true, member: u })} data-testid={`edit-user-${u.id}`}><Pencil className="h-4 w-4" /></Button>
                    {u.id !== user.id && (
                      <ConfirmDialog testId={`delete-user-${u.id}`} title={`Rimuovere ${u.name}?`} description="Se ha log registrati l'account verrà solo disattivato per preservare lo storico."
                        onConfirm={() => remove(u)} trigger={<Button size="icon" variant="ghost" className="h-8 w-8 text-rose-600" data-testid={`delete-user-btn-${u.id}`}><Trash2 className="h-4 w-4" /></Button>} />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <UserDialog open={dialog.open} onOpenChange={(o) => setDialog((d) => ({ ...d, open: o }))} member={dialog.member} onDone={reload} />
      <WorkLogDialog open={logDialog.open} onOpenChange={(o) => setLogDialog((d) => ({ ...d, open: o }))} log={logDialog.log} clients={clients || []} onDone={() => { reloadLogs(); reload(); }} />
    </div>
  );
}
