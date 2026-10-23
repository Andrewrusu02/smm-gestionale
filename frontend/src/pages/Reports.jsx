import { useMemo, useState } from "react";
import { BarChart3, Euro, Wallet } from "lucide-react";
import { EmptyState, PageHeader, Panel, StatCard, NativeSelect } from "@/components/common";
import { api, errMsg, qs, useApi } from "@/lib/api";
import { eur } from "@/lib/constants";
import { toast } from "sonner";

export default function Reports() {
  const now = new Date();
  const [period, setPeriod] = useState("current");
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [year, setYear] = useState(String(now.getFullYear()));
  const [client, setClient] = useState("");
  const [operator, setOperator] = useState("");
  const { data: clients } = useApi("/clients/basic");
  const { data: users } = useApi("/users/basic");
  const params = period === "all" ? { client_id: client, user_id: operator } :
    { client_id: client, user_id: operator, year, ...(period === "year" ? {} : { month: period === "current" ? now.getMonth() + 1 : month }) };
  const { data, loading } = useApi(`/reports/jobs${qs(params)}`);
  const rows = useMemo(() => data?.rows || [], [data]);
  const grouped = useMemo(() => rows.reduce((acc, row) => {
    const client = row.client_name || "Senza cliente";
    const group = row.billing_group === "subscription" ? "subscription" : "single_job";
    acc[client] = acc[client] || { subscription: [], single_job: [] };
    acc[client][group].push(row);
    return acc;
  }, {}), [rows]);
  const totals = data?.totals || { revenue: 0, expense: 0, margin: 0 };
  const csv = useMemo(() => {
    const header = "Data,Cliente,Tipo Lavoro,Descrizione,Eseguito da,Incasso Cliente,Costo Operatore,Margine";
    return [header, ...rows.map((r) => [r.date, r.client_name || "", r.task_title || "", r.description || "", r.user_name || "", r.client_revenue, r.worker_payout, r.margin].map((v) => `"${String(v).replaceAll('"', '""')}"`).join(","))].join("\n");
  }, [rows]);
  const exportCsv = () => { const blob = new Blob([csv], { type: "text/csv;charset=utf-8" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "resoconto-lavori.csv"; a.click(); URL.revokeObjectURL(url); };
  const print = () => { const w = window.open("", "_blank"); if (!w) { toast.error("Il browser ha bloccato la stampa"); return; } w.document.write(`<html><head><title>Resoconto lavori</title><style>body{font:12px Arial;margin:24px}table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid #ddd;padding:7px;text-align:left}</style></head><body><h1>Resoconto lavori</h1><table><tr><th>Data</th><th>Cliente</th><th>Lavoro</th><th>Eseguito da</th><th>Incasso</th><th>Costo</th><th>Margine</th></tr>${rows.map((r) => `<tr><td>${r.date}</td><td>${r.client_name || ""}</td><td>${r.description || ""}</td><td>${r.user_name || ""}</td><td>€ ${r.client_revenue}</td><td>€ ${r.worker_payout}</td><td>€ ${r.margin}</td></tr>`).join("")}</table><p><b>Incassi:</b> € ${totals.revenue} · <b>Spese:</b> € ${totals.expense} · <b>Utile:</b> € ${totals.margin}</p></body></html>`); w.document.close(); w.onload = () => w.print(); };
  return <div data-testid="reports-page">
    <PageHeader eyebrow="Analytics" title="Resoconti" subtitle="Consuntivo completo dei lavori effettuati e del margine generato." actions={<><button onClick={exportCsv} className="rounded-lg border bg-white px-3 py-2 text-sm font-semibold">Esporta CSV</button><button onClick={print} className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white">Stampa</button></>} />
    <div className="mb-6 flex flex-wrap gap-3"><NativeSelect className="w-44" value={period} onChange={(e) => setPeriod(e.target.value)}><option value="current">Mese corrente</option><option value="month">Mese specifico</option><option value="year">Anno</option><option value="all">Tutti</option></NativeSelect>{period === "month" && <NativeSelect className="w-36" value={month} onChange={(e) => setMonth(e.target.value)}>{Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{new Date(2020, i, 1).toLocaleDateString("it-IT", { month: "long" })}</option>)}</NativeSelect>}{period !== "all" && <input className="h-10 w-28 rounded-lg border bg-white px-3" type="number" value={year} onChange={(e) => setYear(e.target.value)} />}<NativeSelect className="w-48" value={client} onChange={(e) => setClient(e.target.value)}><option value="">Tutti i clienti</option>{(clients || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</NativeSelect><NativeSelect className="w-48" value={operator} onChange={(e) => setOperator(e.target.value)}><option value="">Tutti i collaboratori</option>{(users || []).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</NativeSelect></div>
    <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3"><StatCard label="Totale fatturato / incassi" value={eur(totals.revenue)} icon={Euro} tone="emerald" /><StatCard label="Totale spese team" value={eur(totals.expense)} icon={Wallet} tone="rose" /><StatCard label="Utile netto" value={eur(totals.margin)} icon={BarChart3} tone="indigo" /></div>
    <Panel title="Lavori effettuati">{loading ? <p className="py-10 text-center text-slate-500">Caricamento report...</p> : !rows.length ? <EmptyState icon={BarChart3} title="Nessun lavoro nel periodo" /> : <div className="space-y-5">{Object.entries(grouped).map(([clientName, groups]) => <div key={clientName} className="rounded-xl border border-slate-200 p-4"><h3 className="mb-3 font-bold text-slate-800">{clientName}</h3>{[["subscription", "Lavori da Abbonamento"], ["single_job", "Lavori Singoli Extra"]].map(([key, label]) => groups[key].length ? <div key={key} className="mb-4 last:mb-0"><h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-indigo-600">{label}</h4><div className="overflow-x-auto"><table className="w-full text-sm"><tbody>{groups[key].map((r) => <tr key={r.id} className="border-b border-slate-100"><td className="p-2">{r.date}</td><td className="p-2">{r.task_title || r.description}</td><td className="p-2">{r.user_name || "—"}</td><td className="p-2 text-right">{eur(r.client_revenue)}</td><td className="p-2 text-right">{eur(r.worker_payout)}</td><td className="p-2 text-right font-bold">{eur(r.margin)}</td></tr>)}</tbody></table></div></div> : null)}</div>)}</div>}</Panel>
  </div>;
}
