import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, BriefcaseBusiness, Mail, Pencil, Phone, RefreshCcw, Trash2, Video } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Chip, ConfirmDialog, Loading, PageHeader, Panel } from "@/components/common";
import PackageUsage from "@/components/PackageUsage";
import ClientFormDialog from "@/pages/ClientFormDialog";
import { api, errMsg, useApi } from "@/lib/api";
import VideoScripts from "@/pages/VideoScripts";
import TaskFormDialog from "@/pages/TaskFormDialog";
import { WorkLogDialog } from "@/pages/Team";
import {
  CONTENT_TYPES, eur, fmtDate, fmtDateTime, PACKAGE_STYLE, PAYMENT_STATUS, TASK_STATUS_MAP,
} from "@/lib/constants";

export default function ClientDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: c, loading, reload } = useApi(`/clients/${id}`);
  const { data: users } = useApi("/users/basic");
  const [edit, setEdit] = useState(false);
  const [jobOpen, setJobOpen] = useState(false);
  const [taskEdit, setTaskEdit] = useState(null);
  const [logEdit, setLogEdit] = useState(null);

  if (loading && !c) return <Loading />;
  if (!c) return <p>Cliente non trovato.</p>;
  const isSub = Boolean(c.package);
  const style = c.package ? PACKAGE_STYLE[c.package] : null;

  const remove = async () => {
    try {
      await api.delete(`/clients/${c.id}`);
      toast.success("Cliente eliminato");
      navigate("/clienti");
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const renew = async () => {
    try {
      await api.post(`/clients/${c.id}/renew`);
      toast.success("Pacchetto rinnovato: crediti ripristinati e nuovo pagamento Da saldare registrato");
      reload();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  return (
    <div data-testid="client-detail-page">
      <Link to="/clienti" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800" data-testid="back-to-clients"><ArrowLeft className="h-4 w-4" />Clienti</Link>
      <PageHeader
        eyebrow={isSub ? `Abbonamento ${style.label}` : "Cliente neutro"}
        title={c.name}
        subtitle={[c.contact_name, c.vat_number && `P.IVA ${c.vat_number}`].filter(Boolean).join(" · ")}
        actions={<>
          {isSub && (
            <ConfirmDialog testId="renew-package" title="Rinnovare il pacchetto?" confirmLabel="Rinnova" onConfirm={renew}
              description={`I crediti verranno ripristinati al massimo del pacchetto ${style.label} e verrà registrato un nuovo pagamento di ${eur(c.package_info?.price)} in stato Da saldare.`}
              trigger={<Button className={`rounded-xl font-semibold ${c.credits_exhausted ? "bg-rose-600 hover:bg-rose-700 animate-pulse" : "bg-emerald-600 hover:bg-emerald-700"}`} data-testid="renew-package-button"><RefreshCcw className="mr-2 h-4 w-4" />Rinnova Pacchetto</Button>} />
          )}
          <Button variant="outline" onClick={() => setJobOpen(true)}><BriefcaseBusiness className="mr-2 h-4 w-4" />Nuovo lavoro</Button>
          <Button variant="outline" onClick={() => setEdit(true)} data-testid="edit-client-button"><Pencil className="mr-2 h-4 w-4" />Modifica</Button>
          <ConfirmDialog testId="delete-client" title="Eliminare il cliente?" description="Verranno eliminati anche contenuti, task e pagamenti collegati. L'operazione è irreversibile." onConfirm={remove}
            trigger={<Button variant="outline" className="text-rose-600 hover:text-rose-700" data-testid="delete-client-button"><Trash2 className="mr-2 h-4 w-4" />Elimina</Button>} />
        </>}
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {isSub ? (
            <Panel title="Crediti rimanenti" testId="client-usage-panel" action={
              <span className="text-xs text-slate-500" data-testid="client-cycle-info">Ciclo {c.cycle_number || 1} · dal {fmtDate(c.cycle_started_at || c.start_date)}</span>}>
              {c.credits_exhausted && <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700" data-testid="credits-exhausted-banner">Pacchetto esaurito: tutti i crediti sono stati utilizzati. Rinnova il pacchetto per un nuovo ciclo.</p>}
              <PackageUsage usage={c.usage} pkg={c.package} testPrefix="client-package-progress" />
              <p className="mt-4 text-xs text-slate-400">Il pacchetto non scade a fine mese: ogni contenuto programmato a calendario scala 1 credito. Eliminandolo il credito torna disponibile.</p>
            </Panel>
          ) : (
            <Panel title="Lavori singoli">
              <p className="whitespace-pre-line text-sm text-slate-600">I lavori singoli associati a questo cliente sono visibili nelle attività e nello storico lavori.</p>
              <div className="mt-4 flex items-center gap-3">
                <span className="font-num text-2xl font-bold">{eur(c.balance)}</span>
                <span className="text-xs text-slate-500">da saldare · totale {eur(c.total_amount)} · pagato {eur(c.paid_amount)}</span>
              </div>
              <p className="mt-3 rounded-lg bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-800">
                Crediti lavori da incassare: {eur(c.work_revenue_balance ?? c.balance)}
              </p>
            </Panel>
          )}
          <Panel title={isSub ? "Contenuti del ciclo corrente" : "Contenuti"}>
            {!c.posts?.length ? <p className="text-sm text-slate-500">Nessun contenuto programmato.</p> : (
              <ul className="divide-y divide-slate-100">
                {(c.posts || []).map((p) => (
                  <li key={p.id} className="flex items-center justify-between py-2.5 text-sm">
                    <span className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${CONTENT_TYPES[p.content_type].dot}`} />{p.title}</span>
                    <span className="flex items-center gap-3 text-xs text-slate-500">{CONTENT_TYPES[p.content_type].label} · {fmtDateTime(p.scheduled_at)}
                      {p.status === "consegnato" && <Chip className="border-emerald-200 bg-emerald-50 text-emerald-700">Consegnato</Chip>}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="Attività recenti">
            {!c.tasks?.length ? <p className="text-sm text-slate-500">Nessun task.</p> : (
              <ul className="divide-y divide-slate-100">
                {(c.tasks || []).map((t) => (
                  <li key={t.id} className="flex items-center justify-between py-2.5 text-sm">
                    <span className="truncate">{t.title}</span>
                    <span className="flex items-center gap-2 text-xs text-slate-500">{t.assignee_name || "Non assegnato"}<Chip className={(TASK_STATUS_MAP[t.status] || TASK_STATUS_MAP.da_fare).chip}>{(TASK_STATUS_MAP[t.status] || TASK_STATUS_MAP.da_fare).label}</Chip><Button size="icon" variant="ghost" onClick={() => setTaskEdit(t)}><Pencil className="h-3.5 w-3.5" /></Button></span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="Storico lavori conclusi">
            {!c.work_logs?.length ? <p className="text-sm text-slate-500">Nessun lavoro concluso.</p> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-xs uppercase text-slate-500"><th className="p-2">Data</th><th className="p-2">Attività</th><th className="p-2">Operatore</th><th className="p-2 text-right">Entrata</th><th className="p-2 text-right">Compenso</th><th className="p-2 text-right">Margine</th><th /></tr></thead><tbody>{c.work_logs.map((log) => <tr key={log.id} className="border-b border-slate-100"><td className="p-2">{fmtDate(log.date)}</td><td className="p-2">{log.task_title}</td><td className="p-2">{log.user_name || "—"}</td><td className="p-2 text-right">{eur(log.client_revenue)}</td><td className="p-2 text-right">{eur(log.worker_payout)}</td><td className="p-2 text-right font-bold">{eur(log.margin)}</td><td className="p-2 text-right"><Button size="icon" variant="ghost" onClick={() => setLogEdit(log)}><Pencil className="h-4 w-4" /></Button><ConfirmDialog title="Eliminare il lavoro?" onConfirm={async () => { try { await api.delete(`/work-logs/${log.id}`); toast.success("Lavoro eliminato"); reload(); } catch (e) { toast.error(errMsg(e)); } }} trigger={<Button size="icon" variant="ghost"><Trash2 className="h-4 w-4 text-rose-500" /></Button>} /></td></tr>)}</tbody></table></div>}
          </Panel>
          <Panel title="Script video" action={<Video className="h-4 w-4 text-indigo-500" />}>
            <VideoScripts clientId={c.id} />
          </Panel>
        </div>
        <div className="space-y-6">
          <Panel title="Contatti">
            <div className="space-y-2 text-sm text-slate-600">
              <p className="flex items-center gap-2"><Mail className="h-4 w-4 text-slate-400" />{c.email || "—"}</p>
              <p className="flex items-center gap-2"><Phone className="h-4 w-4 text-slate-400" />{c.phone || "—"}</p>
              {isSub && <p className="pt-2 text-xs text-slate-500">Attivo dal {fmtDate(c.start_date)} · scadenza rata il giorno {c.billing_day}</p>}
              {c.notes && <p className="whitespace-pre-line rounded-lg bg-slate-50 p-3 text-xs">{c.notes}</p>}
            </div>
          </Panel>
          <Panel title="Pagamenti" action={<Link to="/pagamenti" className="text-xs font-semibold text-indigo-600 hover:underline">Tutti</Link>}>
            {!c.payments?.length ? <p className="text-sm text-slate-500">Nessun pagamento.</p> : (
              <ul className="divide-y divide-slate-100" data-testid="client-payments-list">
                {(c.payments || []).slice(0, 8).map((p) => (
                  <li key={p.id} className="flex items-center justify-between py-2.5 text-sm">
                    <div><p className="font-num font-bold">{eur(p.amount)}</p><p className="text-xs text-slate-500">{p.task_title || p.description || "Saldo generale"} · scad. {fmtDate(p.due_date)}</p></div>
                    <Chip className={(PAYMENT_STATUS[p.status] || PAYMENT_STATUS.in_attesa).chip}>{(PAYMENT_STATUS[p.status] || PAYMENT_STATUS.in_attesa).label}</Chip>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
      <ClientFormDialog open={edit} onOpenChange={setEdit} client={c} onSaved={reload} />
      <TaskFormDialog open={jobOpen} onOpenChange={setJobOpen} clientId={c.id} clients={[c]} users={users || []} onSaved={reload} />
      <TaskFormDialog open={!!taskEdit} onOpenChange={(open) => !open && setTaskEdit(null)} task={taskEdit} clientId={c.id} clients={[c]} users={users || []} onSaved={() => { setTaskEdit(null); reload(); }} />
      <WorkLogDialog open={!!logEdit} onOpenChange={(open) => !open && setLogEdit(null)} log={logEdit} clients={[c]} onDone={reload} />
    </div>
  );
}
