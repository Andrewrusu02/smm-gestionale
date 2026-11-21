import { useState } from "react";
import { Loader2, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Chip, ConfirmDialog, EmptyState, Loading, PageHeader, Panel } from "@/components/common";
import { api, errMsg, useApi } from "@/lib/api";
import { fmtDate, fmtDateTime } from "@/lib/constants";

const ENTITY_STYLE = {
  client: "border-indigo-200 bg-indigo-50 text-indigo-700",
  task: "border-amber-200 bg-amber-50 text-amber-800",
  post: "border-sky-200 bg-sky-50 text-sky-700",
  payment: "border-emerald-200 bg-emerald-50 text-emerald-700",
  work_log: "border-violet-200 bg-violet-50 text-violet-700",
  quote: "border-pink-200 bg-pink-50 text-pink-700",
  video_script: "border-orange-200 bg-orange-50 text-orange-700",
  contract: "border-slate-200 bg-slate-50 text-slate-600",
};

export default function Trash() {
  const { data, loading, reload } = useApi("/trash");
  const [busy, setBusy] = useState("");
  const run = async (key, fn, message) => {
    setBusy(key);
    try {
      await fn();
      toast.success(message);
      reload();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy("");
    }
  };
  const restore = (i) => run(`r-${i.batch}`, () => api.post(`/trash/${encodeURIComponent(i.batch)}/restore`),
    i.linked_count ? `${i.entity_label} ripristinato con ${i.linked_count} elementi collegati` : `${i.entity_label} ripristinato`);
  const purge = (i) => run(`p-${i.batch}`, () => api.delete(`/trash/${encodeURIComponent(i.batch)}`), "Eliminato definitivamente");
  return (
    <div data-testid="trash-page">
      <PageHeader
        eyebrow="Sicurezza dati"
        title="Cestino"
        subtitle={`Gli elementi eliminati restano qui per ${data?.retention_days || 30} giorni, poi vengono cancellati definitivamente. Non contano nei totali, nella dashboard e nelle notifiche.`}
      />
      {loading && !data ? <Loading /> : !data?.items?.length ? (
        <EmptyState icon={Trash2} title="Il cestino è vuoto" text="Quando elimini clienti, task, contenuti, pagamenti, lavori o preventivi li ritrovi qui." testId="trash-empty" />
      ) : (
        <Panel title={`${data.items.length} element${data.items.length === 1 ? "o" : "i"} nel cestino`}>
          <div className="divide-y divide-slate-100">
            {data.items.map((i) => (
              <div key={i.batch} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between" data-testid="trash-row">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Chip className={ENTITY_STYLE[i.entity] || ENTITY_STYLE.contract}>{i.entity_label}</Chip>
                    <p className="truncate font-semibold text-slate-900">{i.title}</p>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {i.client_name && i.entity !== "client" && <>{i.client_name} · </>}
                    Eliminato il {fmtDateTime(i.deleted_at + "Z")} da {i.deleted_by_name}
                    {" · "}<span className={i.days_left <= 3 ? "font-semibold text-rose-600" : ""}>cancellazione definitiva il {fmtDate(i.purge_at.slice(0, 10))}</span>
                  </p>
                  {i.linked_count > 0 && (
                    <p className="mt-1 text-xs text-slate-500">
                      Insieme a: {i.linked_summary.map((s) => `${s.count} ${s.label.toLowerCase()}`).join(", ")}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button variant="outline" size="sm" onClick={() => restore(i)} disabled={!!busy} data-testid="trash-restore-button">
                    {busy === `r-${i.batch}` ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}Ripristina
                  </Button>
                  <ConfirmDialog
                    testId="trash-purge"
                    title="Eliminare definitivamente?"
                    description={`«${i.title}»${i.linked_count ? ` e ${i.linked_count} elementi collegati` : ""} verranno cancellati per sempre. L'operazione non si può annullare.`}
                    confirmLabel="Elimina per sempre"
                    onConfirm={() => purge(i)}
                    trigger={<Button variant="ghost" size="sm" className="text-rose-600" disabled={!!busy} data-testid="trash-purge-button"><Trash2 className="mr-2 h-4 w-4" />Elimina</Button>}
                  />
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}
