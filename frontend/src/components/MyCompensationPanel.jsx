import { useState } from "react";
import { CheckCircle2, Clock, Wallet } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Chip, Loading, Panel, StatCard } from "@/components/common";
import { useApi } from "@/lib/api";
import { currentPeriod, eur, fmtDate, periodLabel } from "@/lib/constants";

function LogList({ items, empty }) {
  if (!items.length) return <p className="text-sm text-slate-500">{empty}</p>;
  return (
    <ul className="divide-y divide-slate-100">
      {items.map((w) => (
        <li key={w.id} className="flex items-center justify-between gap-3 py-2.5 text-sm" data-testid="my-comp-row">
          <div className="min-w-0">
            <p className="truncate font-semibold text-slate-800">{w.title}</p>
            <p className="text-xs text-slate-500">{[fmtDate(w.date), w.client_name].filter(Boolean).join(" · ")}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {w.paid
              ? <Chip className="border-emerald-200 bg-emerald-50 text-emerald-700">{w.paid_at ? `Ricevuto il ${fmtDate(w.paid_at)}` : "Ricevuto"}</Chip>
              : <Chip className="border-amber-200 bg-amber-50 text-amber-800">Da ricevere</Chip>}
            <span className="w-20 text-right font-num font-bold text-slate-900">{eur(w.amount)}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** I compensi del collaboratore collegato: solo i suoi dati. */
export default function MyCompensationPanel() {
  const [period, setPeriod] = useState(currentPeriod);
  const [year, month] = period.split("-").map(Number);
  const { data } = useApi(`/me/compensation?year=${year}&month=${month}`);
  const [tab, setTab] = useState("month");
  return (
    <Panel
      title="I miei compensi"
      className="lg:col-span-2"
      testId="my-compensation"
      action={<Input type="month" value={period} onChange={(e) => e.target.value && setPeriod(e.target.value)} className="h-9 w-40" data-testid="my-comp-period" />}
    >
      {!data ? <Loading /> : (
        <>
          <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatCard label={`Maturati a ${periodLabel(period, true)}`} value={eur(data.accrued_month)} hint={`${data.accrued_count} lavori nel mese`} icon={Wallet} tone="indigo" testId="my-comp-accrued" />
            <StatCard label="Da ricevere" value={eur(data.pending_total)} hint={`${data.pending_count} lavori non ancora saldati`} icon={Clock} tone="amber" testId="my-comp-pending" className="rise-1" />
            <StatCard label={`Ricevuti a ${periodLabel(period, true)}`} value={eur(data.received_month)} hint={`Totale ricevuto: ${eur(data.received_total)}`} icon={CheckCircle2} tone="emerald" testId="my-comp-received" className="rise-2" />
          </div>
          <div className="mb-3 flex gap-2">
            {[["month", `Lavori di ${periodLabel(period, true)}`], ["pending", "Tutti quelli da ricevere"]].map(([k, label]) => (
              <button key={k} type="button" onClick={() => setTab(k)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${tab === k ? "bg-indigo-50 text-indigo-700" : "text-slate-500 hover:bg-slate-50"}`}>{label}</button>
            ))}
          </div>
          {tab === "month"
            ? <LogList items={data.month_logs} empty="Nessun lavoro registrato in questo mese." />
            : <LogList items={data.pending_logs} empty="Non hai compensi da ricevere." />}
        </>
      )}
    </Panel>
  );
}
