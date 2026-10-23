import { useMemo, useState } from "react";
import { CalendarDays, Pencil, Plus, Trash2, Video } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Chip, ConfirmDialog, EmptyState, Loading, NativeSelect, PageHeader } from "@/components/common";
import VideoScriptDialog, { SCRIPT_STATUSES } from "@/pages/VideoScriptDialog";
import { api, errMsg, useApi } from "@/lib/api";
import { fmtDate } from "@/lib/constants";

const STATUS_STYLE = {
  BOZZA: "border-slate-200 bg-slate-50 text-slate-600", SCRIPT_PRONTO: "border-indigo-200 bg-indigo-50 text-indigo-700",
  DA_REGISTRARE: "border-amber-200 bg-amber-50 text-amber-700", REGISTRATO: "border-cyan-200 bg-cyan-50 text-cyan-700",
  IN_MONTAGGIO: "border-violet-200 bg-violet-50 text-violet-700", COMPLETATO: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

export default function VideoScripts({ clientId }) {
  const { data: scripts, loading, reload } = useApi(`/scripts${clientId ? `?client_id=${clientId}` : ""}`);
  const { data: clients } = useApi("/clients/basic");
  const [filter, setFilter] = useState("");
  const [dialog, setDialog] = useState({ open: false, script: null });
  const visible = useMemo(() => (scripts || []).filter((item) => !filter || String(item.client_id) === filter), [scripts, filter]);
  const remove = async (id) => {
    try { await api.delete(`/scripts/${id}`); toast.success("Script eliminato"); reload(); } catch (e) { toast.error(errMsg(e)); }
  };
  const label = (status) => SCRIPT_STATUSES.find(([key]) => key === status)?.[1] || status;
  return (
    <div data-testid="video-scripts-page">
      {!clientId && <PageHeader eyebrow="Content production" title="Script & idee video" subtitle="Organizza concept, copioni e giornate di shooting in un unico posto."
        actions={<Button onClick={() => setDialog({ open: true, script: null })} className="min-h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700"><Plus className="mr-2 h-4 w-4" />Nuova idea</Button>} />}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row">
        {!clientId && <NativeSelect value={filter} onChange={(e) => setFilter(e.target.value)} className="sm:max-w-xs"><option value="">Tutti i clienti</option>{(clients || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</NativeSelect>}
        {clientId && <Button onClick={() => setDialog({ open: true, script: null })} className="min-h-11 self-start rounded-xl bg-indigo-600 hover:bg-indigo-700"><Plus className="mr-2 h-4 w-4" />Nuova idea</Button>}
      </div>
      {loading && !scripts ? <Loading /> : visible.length === 0 ? <EmptyState icon={Video} title="Nessuna idea video" text="Aggiungi il primo concept per iniziare a pianificare le registrazioni." /> : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((item) => (
            <article key={item.id} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">{item.client_name}</p><h3 className="mt-1 text-lg font-bold text-slate-900">{item.title}</h3></div><Chip className={STATUS_STYLE[item.status]}>{label(item.status)}</Chip></div>
              <p className="mt-3 line-clamp-3 whitespace-pre-line text-sm text-slate-600">{item.concept || item.script_body || "Nessun testo inserito."}</p>
              <div className="mt-4 flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800"><CalendarDays className="h-4 w-4" />{item.shooting_date ? fmtDate(item.shooting_date) : "Data shooting da programmare"}</div>
              {item.notes && <p className="mt-3 line-clamp-2 text-xs text-slate-500">{item.notes}</p>}
              <div className="mt-4 flex gap-2 border-t border-slate-100 pt-3"><Button variant="outline" className="min-h-11 flex-1" onClick={() => setDialog({ open: true, script: item })}><Pencil className="mr-2 h-4 w-4" />Modifica</Button><ConfirmDialog title="Eliminare lo script?" onConfirm={() => remove(item.id)} trigger={<Button variant="ghost" className="min-h-11 px-3"><Trash2 className="h-4 w-4 text-rose-500" /></Button>} /></div>
            </article>
          ))}
        </div>
      )}
      <VideoScriptDialog open={dialog.open} onOpenChange={(open) => setDialog((state) => ({ ...state, open }))} clients={clients || []} clientId={clientId} script={dialog.script} onSaved={reload} />
    </div>
  );
}
