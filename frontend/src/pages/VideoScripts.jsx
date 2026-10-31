import { useMemo, useState } from "react";
import { CalendarDays, Maximize2, Pencil, Plus, Trash2, Video, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
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
  const [teleprompter, setTeleprompter] = useState(null);
  const visible = useMemo(() => (scripts || []).filter((item) => !filter || String(item.client_id) === filter), [scripts, filter]);
  const grouped = useMemo(() => visible.reduce((groups, item) => {
    const key = item.client_id || "unassigned";
    groups[key] = groups[key] || { name: item.client_name || "Cliente", items: [] };
    groups[key].items.push(item);
    return groups;
  }, {}), [visible]);
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
        <div className="space-y-8">
          {Object.entries(grouped).map(([clientKey, group]) => <section key={clientKey} aria-labelledby={`scripts-client-${clientKey}`}>
            <h2 id={`scripts-client-${clientKey}`} className="mb-3 text-sm font-bold uppercase tracking-wider text-slate-500">{group.name}<span className="ml-2 font-normal">({group.items.length})</span></h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {group.items.map((item) => (
            <article key={item.id} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">{item.client_name}</p><h3 className="mt-1 text-lg font-bold text-slate-900">{item.title}</h3></div><Chip className={STATUS_STYLE[item.status]}>{label(item.status)}</Chip></div>
              <p className="mt-3 line-clamp-3 whitespace-pre-line text-sm text-slate-600">{item.concept || item.script_body || "Nessun testo inserito."}</p>
              <div className="mt-4 flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800"><CalendarDays className="h-4 w-4" />{item.shooting_date ? fmtDate(item.shooting_date) : "Data shooting da programmare"}</div>
              {item.notes && <p className="mt-3 line-clamp-2 text-xs text-slate-500">{item.notes}</p>}
              <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                <Button variant="outline" className="min-h-11 flex-1" onClick={() => setTeleprompter(item)}><Maximize2 className="mr-2 h-4 w-4" />Visualizza per Registrazione</Button>
                <Button variant="outline" className="min-h-11" onClick={() => setDialog({ open: true, script: item })}><Pencil className="h-4 w-4" /></Button>
                <ConfirmDialog title="Eliminare lo script?" onConfirm={() => remove(item.id)} trigger={<Button variant="ghost" className="min-h-11 px-3"><Trash2 className="h-4 w-4 text-rose-500" /></Button>} />
              </div>
            </article>
            ))}
            </div>
          </section>)}
        </div>
      )}
      <VideoScriptDialog open={dialog.open} onOpenChange={(open) => setDialog((state) => ({ ...state, open }))} clients={clients || []} clientId={clientId} script={dialog.script} onSaved={reload} />
      <Dialog open={!!teleprompter} onOpenChange={(open) => !open && setTeleprompter(null)}>
        <DialogContent className="h-[100dvh] w-screen max-w-none rounded-none border-0 bg-slate-950 p-0 text-white">
          {teleprompter && <div className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b border-white/10 px-6 py-4"><p className="text-sm font-semibold text-slate-400">{teleprompter.client_name} · {teleprompter.title}</p><Button variant="ghost" onClick={() => setTeleprompter(null)} className="text-slate-300 hover:bg-white/10 hover:text-white" aria-label="Chiudi teleprompter"><X className="h-5 w-5" /></Button></div>
            <div className="mx-auto flex w-full max-w-5xl flex-1 items-center overflow-y-auto px-6 py-12 sm:px-12"><p className="w-full whitespace-pre-wrap text-2xl font-semibold leading-relaxed tracking-wide sm:text-4xl">{teleprompter.script_body || teleprompter.concept || "Nessun testo inserito."}</p></div>
          </div>}
        </DialogContent>
      </Dialog>
    </div>
  );
}
