import { useMemo, useState } from "react";
import { Download, FileText, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Chip, ConfirmDialog, EmptyState, Loading, PageHeader } from "@/components/common";
import QuoteFormDialog from "@/pages/QuoteFormDialog";
import { api, errMsg, useApi } from "@/lib/api";
import { eur, fmtDate } from "@/lib/constants";

const STATUS = { bozza: ["Bozza", "bg-slate-100 text-slate-700 border-slate-200"], inviato: ["Inviato", "bg-blue-50 text-blue-700 border-blue-200"], accettato: ["Accettato", "bg-emerald-50 text-emerald-700 border-emerald-200"], rifiutato: ["Rifiutato", "bg-rose-50 text-rose-700 border-rose-200"] };

async function printQuote(q) {
  try {
    const response = await api.get(`/quotes/${q.id}/pdf`, { responseType: "blob" });
    const url = URL.createObjectURL(response.data);
    const w = window.open(url, "_blank");
    if (!w) { URL.revokeObjectURL(url); throw new Error("Il browser ha bloccato la finestra PDF"); }
    w.onload = () => { w.focus(); w.print(); URL.revokeObjectURL(url); };
    return;
  } catch (error) {
    toast.error(errMsg(error));
  }
  const rows = q.items.map((i) => `<tr><td>${i.description}</td><td>${i.quantity}</td><td>${eur(i.unit_price)}</td><td>${eur(i.total)}</td></tr>`).join("");
  const w = window.open("", "_blank", "noopener,noreferrer");
  if (!w) { toast.error("Il browser ha bloccato la finestra di stampa"); return; }
  w.document.write(`<html><head><title>${q.number}</title><style>body{font:14px Arial;color:#172033;max-width:800px;margin:40px auto}h1{color:#4f46e5}table{width:100%;border-collapse:collapse;margin-top:28px}th,td{border-bottom:1px solid #ddd;padding:12px;text-align:left}td:nth-child(n+2),th:nth-child(n+2){text-align:right}.total{text-align:right;font-size:20px;font-weight:bold;margin-top:22px}.meta{color:#64748b;line-height:1.8}@media print{body{margin:0}}</style></head><body><h1>Preventivo ${q.number}</h1><div class="meta"><b>Cliente:</b> ${q.client_name}<br><b>Data:</b> ${fmtDate(q.issue_date)}${q.delivery_date ? `<br><b>Consegna prevista:</b> ${fmtDate(q.delivery_date)}` : ""}</div><table><thead><tr><th>Servizio</th><th>Qtà</th><th>Prezzo unitario</th><th>Totale</th></tr></thead><tbody>${rows}</tbody></table><p class="total">Totale: ${eur(q.total)}</p>${q.notes ? `<p><b>Note:</b><br>${q.notes.replace(/\\n/g, "<br>")}</p>` : ""}</body></html>`);
  w.document.close(); w.focus(); w.print();
}

export default function Quotes() {
  const { data: quotes, loading, reload } = useApi("/quotes");
  const { data: clients } = useApi("/clients/basic");
  const [q, setQ] = useState(""); const [open, setOpen] = useState(false); const [editing, setEditing] = useState(null);
  const list = useMemo(() => (quotes || []).filter((x) => `${x.number} ${x.client_name}`.toLowerCase().includes(q.toLowerCase())), [quotes, q]);
  const remove = async (id) => { try { await api.delete(`/quotes/${id}`); toast.success("Preventivo eliminato"); reload(); } catch (e) { toast.error(errMsg(e)); } };
  return <div data-testid="quotes-page">
    <PageHeader eyebrow="Commerciale" title="Preventivi" subtitle="Crea offerte con servizi, date di consegna e cliente associato. Stampa o salva ogni preventivo in PDF."
      actions={<Button onClick={() => { setEditing(null); setOpen(true); }} className="rounded-xl bg-indigo-600 hover:bg-indigo-700"><Plus className="mr-2 h-4 w-4" />Nuovo preventivo</Button>} />
    <div className="mb-6 relative max-w-sm"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input className="bg-white pl-9" placeholder="Cerca numero o cliente..." value={q} onChange={(e) => setQ(e.target.value)} /></div>
    {loading ? <Loading /> : list.length === 0 ? <EmptyState icon={FileText} title="Nessun preventivo" text="Crea il primo preventivo e associa i servizi a un cliente." action={<Button variant="outline" onClick={() => setOpen(true)}>Nuovo preventivo</Button>} /> :
      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm"><div className="divide-y divide-slate-100">
        {list.map((x) => { const st = STATUS[x.status] || STATUS.bozza; return <div key={x.id} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-bold text-slate-900">{x.number}</p><Chip className={st[1]}>{st[0]}</Chip></div><p className="mt-1 text-sm text-slate-600">{x.client_name}</p><p className="mt-1 text-xs text-slate-400">Data {fmtDate(x.issue_date)}{x.delivery_date ? ` · Consegna ${fmtDate(x.delivery_date)}` : ""} · {x.items.length} servizi</p></div><div className="flex items-center gap-3"><p className="font-num text-lg font-bold">{eur(x.total)}</p><Button variant="outline" size="icon" title="Scarica PDF" onClick={() => printQuote(x)}><Download className="h-4 w-4" /></Button><Button variant="ghost" size="icon" title="Modifica" onClick={() => { setEditing(x); setOpen(true); }}><Pencil className="h-4 w-4" /></Button><ConfirmDialog title="Eliminare il preventivo?" onConfirm={() => remove(x.id)} trigger={<Button variant="ghost" size="icon" title="Elimina"><Trash2 className="h-4 w-4 text-rose-500" /></Button>} /></div></div>; })}
      </div></div>}
    <QuoteFormDialog open={open} onOpenChange={setOpen} quote={editing} clients={clients || []} onSaved={reload} />
  </div>;
}
