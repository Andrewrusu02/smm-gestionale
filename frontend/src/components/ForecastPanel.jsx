import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Loading, Panel } from "@/components/common";
import { useApi } from "@/lib/api";
import { eur, periodLabel } from "@/lib/constants";

// Blu = entrate, arancio = uscite: coppia verificata per daltonismo, con una variante per il tema scuro.
const COLORS = { light: { in: "#2563EB", out: "#EA580C" }, dark: { in: "#3B82F6", out: "#EA580C" } };

const ROWS = [
  { key: "subscriptions", label: "Rate abbonamenti", sign: 1 },
  { key: "pending_payments", label: "Pagamenti in attesa", sign: 1 },
  { key: "single_jobs", label: "Lavori singoli aperti", sign: 1 },
  { key: "team_payouts", label: "Compensi da saldare", sign: -1 },
  { key: "recurring_expenses", label: "Spese ricorrenti", sign: -1 },
];

function ForecastTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const m = payload[0].payload;
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-semibold text-slate-900">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="flex items-center gap-2 text-slate-600">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />{p.name}: <span className="font-num text-slate-900">{eur(p.value)}</span>
        </p>
      ))}
      <p className="mt-1 border-t border-slate-100 pt-1 text-slate-600">Saldo: <span className="font-num font-semibold text-slate-900">{eur(m.net)}</span></p>
    </div>
  );
}

export default function ForecastPanel() {
  const { data, loading } = useApi("/forecast?months=3");
  const [open, setOpen] = useState(null);
  const dark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");
  const c = dark ? COLORS.dark : COLORS.light;
  if (loading && !data) return <Panel title="Previsione incassi (3 mesi)"><Loading /></Panel>;
  if (!data) return null;
  const chart = data.months.map((m) => ({ ...m, label: periodLabel(m.period, true) }));
  return (
    <Panel title="Previsione incassi (3 mesi)" className="xl:col-span-3" testId="forecast-panel"
      action={<span className="text-xs text-slate-500">Saldo previsto: <span className={`font-num font-bold ${data.totals.net < 0 ? "text-rose-600" : "text-slate-900"}`}>{eur(data.totals.net)}</span></span>}>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chart} barGap={2} barCategoryGap="28%">
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
              <YAxis tickLine={false} axisLine={false} fontSize={12} tickFormatter={(v) => `€${v}`} width={60} />
              <Tooltip content={<ForecastTooltip />} cursor={{ fill: "#f1f5f9" }} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="inflow" name="Entrate previste" fill={c.in} radius={[4, 4, 0, 0]} />
              <Bar dataKey="outflow" name="Uscite previste" fill={c.out} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <p className="mt-2 text-xs text-slate-500">I pagamenti scaduti e i compensi ancora da saldare sono conteggiati nel mese corrente.</p>
        </div>
        <div className="overflow-x-auto lg:col-span-3">
          <table className="w-full text-sm" data-testid="forecast-table">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wider text-slate-500">
                <th className="py-2 pr-2">Voce</th>
                {data.months.map((m) => <th key={m.period} className="px-2 py-2 text-right">{periodLabel(m.period)}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ROWS.map((r) => (
                <FragmentRow key={r.key} row={r} months={data.months} open={open === r.key} onToggle={() => setOpen(open === r.key ? null : r.key)} />
              ))}
              <tr className="font-semibold">
                <td className="py-2 pr-2 text-slate-900">Saldo del mese</td>
                {data.months.map((m) => <td key={m.period} className={`px-2 py-2 text-right font-num ${m.net < 0 ? "text-rose-600" : "text-slate-900"}`}>{eur(m.net)}</td>)}
              </tr>
              <tr>
                <td className="py-2 pr-2 text-slate-500">Saldo cumulato</td>
                {data.months.map((m) => <td key={m.period} className="px-2 py-2 text-right font-num text-slate-600">{eur(m.cumulative)}</td>)}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </Panel>
  );
}

function FragmentRow({ row, months, open, onToggle }) {
  const hasDetails = months.some((m) => m.details?.[row.key]?.length);
  return (
    <>
      <tr>
        <td className="py-2 pr-2">
          <button type="button" onClick={onToggle} disabled={!hasDetails} className="flex items-center gap-1 text-left text-slate-700 disabled:cursor-default">
            {hasDetails ? (open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />) : <span className="w-3.5" />}
            {row.label}
          </button>
        </td>
        {months.map((m) => (
          <td key={m.period} className="px-2 py-2 text-right font-num text-slate-700">{m[row.key] ? `${row.sign < 0 ? "− " : ""}${eur(m[row.key])}` : "—"}</td>
        ))}
      </tr>
      {open && (
        <tr>
          <td colSpan={months.length + 1} className="bg-slate-50 px-3 py-2">
            <div className="grid gap-3 sm:grid-cols-3">
              {months.map((m) => (
                <div key={m.period}>
                  <p className="mb-1 text-xs font-semibold text-slate-500">{periodLabel(m.period, true)}</p>
                  <ul className="space-y-0.5 text-xs">
                    {(m.details?.[row.key] || []).map((d, i) => (
                      <li key={i} className="flex justify-between gap-2"><span className="truncate text-slate-600">{d.label}</span><span className="font-num text-slate-900">{eur(d.amount)}</span></li>
                    ))}
                    {!m.details?.[row.key]?.length && <li className="text-slate-400">—</li>}
                  </ul>
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
