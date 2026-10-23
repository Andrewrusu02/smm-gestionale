import { Link } from "react-router-dom";
import { AlertTriangle, Banknote, KanbanSquare, PiggyBank, TrendingDown, TrendingUp, Trophy } from "lucide-react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Chip, Loading, PageHeader, Panel, StatCard } from "@/components/common";
import { useApi } from "@/lib/api";
import { eur, fmtDate, PACKAGE_STYLE, periodLabel } from "@/lib/constants";
import { useAuth } from "@/context/AuthContext";

const tooltipStyle = { borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 };

function RevenueChart({ series }) {
  const data = series.map((s) => ({ ...s, label: periodLabel(s.period) }));
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} barGap={4}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
        <YAxis tickLine={false} axisLine={false} fontSize={12} tickFormatter={(v) => `€${v}`} width={60} />
        <Tooltip formatter={(v) => eur(v)} contentStyle={tooltipStyle} cursor={{ fill: "#f1f5f9" }} />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="abbonamenti" name="Abbonamenti" stackId="e" fill="#10B981" />
        <Bar dataKey="lavori_singoli" name="Lavori singoli" stackId="e" fill="#6EE7B7" radius={[6, 6, 0, 0]} />
        <Bar dataKey="spese" name="Spese (costi team)" fill="#EF4444" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function ProfitChart({ series }) {
  const data = series.map((s) => ({ ...s, label: periodLabel(s.period) }));
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id="utile" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366F1" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#6366F1" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
        <YAxis tickLine={false} axisLine={false} fontSize={12} tickFormatter={(v) => `€${v}`} width={60} />
        <Tooltip formatter={(v) => eur(v)} contentStyle={tooltipStyle} />
        <Area type="monotone" dataKey="utile" name="Utile netto" stroke="#6366F1" strokeWidth={2.5} fill="url(#utile)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function PackagePie({ data }) {
  const total = data.reduce((a, b) => a + b.value, 0);
  if (!total) return <p className="py-16 text-center text-sm text-slate-500">Nessun cliente attivo.</p>;
  return (
    <div>
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie data={data.filter((d) => d.value)} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={3} stroke="none">
            {data.filter((d) => d.value).map((d) => <Cell key={d.package} fill={PACKAGE_STYLE[d.package].color} />)}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} />
        </PieChart>
      </ResponsiveContainer>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {data.map((d) => (
          <div key={d.package} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs" data-testid={`pie-legend-${d.package}`}>
            <span className="flex items-center gap-2 font-medium text-slate-600">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: PACKAGE_STYLE[d.package].color }} />{d.name}
            </span>
            <span className="font-num font-bold">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Leaderboard({ rows }) {
  const max = Math.max(1, ...rows.map((r) => r.completed_month));
  if (!rows.length) return <p className="text-sm text-slate-500">Nessun membro del team.</p>;
  return (
    <ol className="space-y-3">
      {rows.map((r, i) => (
        <li key={r.user_id} className="flex items-center gap-3" data-testid={`leaderboard-row-${r.user_id}`}>
          <span className={`font-num flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${i === 0 ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"}`}>{i + 1}</span>
          <div className="min-w-0 flex-1">
            <div className="flex justify-between text-sm">
              <span className="truncate font-semibold text-slate-800">{r.name}</span>
              <span className="font-num text-slate-500">{r.completed_month} task · {r.hours_month}h</span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-indigo-500 transition-all duration-700" style={{ width: `${(r.completed_month / max) * 100}%` }} />
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

function PaymentList({ items, empty, testId }) {
  if (!items.length) return <p className="text-sm text-slate-500">{empty}</p>;
  return (
    <ul className="divide-y divide-slate-100" data-testid={testId}>
      {items.map((p) => (
        <li key={p.id} className="flex items-center justify-between py-2.5 text-sm">
          <div>
            <p className="font-semibold text-slate-800">{p.client_name}</p>
            <p className="text-xs text-slate-500">Scadenza {fmtDate(p.due_date)}</p>
          </div>
          <span className="font-num font-bold">{eur(p.amount)}</span>
        </li>
      ))}
    </ul>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const { data, loading } = useApi("/dashboard?months=6");
  if (loading || !data) return <Loading />;
  const k = data.kpi;
  return (
    <div data-testid="admin-dashboard">
      <PageHeader
        eyebrow="Reportistica"
        title={`Ciao ${user.name}`}
        subtitle="Andamento economico dell'agenzia: entrate da abbonamenti e lavori singoli, costi del team dai log lavori e utile netto."
      />
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Entrate del mese" value={eur(k.entrate_mese)} hint={`Incassato ${eur(k.incassato_mese)}`} icon={TrendingUp} tone="emerald" testId="kpi-entrate" />
        <StatCard label="Spese del mese" value={eur(k.spese_mese)} hint="Costi da log lavori" icon={TrendingDown} tone="rose" testId="kpi-spese" className="rise-1" />
        <StatCard label="Utile netto" value={eur(k.utile_mese)} hint="Entrate − spese" icon={PiggyBank} tone="indigo" testId="kpi-utile" className="rise-2" />
        <StatCard label="Valore abbonamenti attivi" value={eur(k.mrr)} hint={`${k.abbonamenti_attivi} abbonamenti attivi`} icon={Banknote} tone="slate" testId="kpi-mrr" className="rise-3" />
        <StatCard label="Pagamenti in ritardo" value={k.ritardi_count} hint={eur(k.ritardi_importo)} icon={AlertTriangle} tone={k.ritardi_count ? "rose" : "slate"} testId="kpi-ritardi" className="rise-4" />
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Panel title="Entrate vs Spese" className="xl:col-span-2" testId="chart-revenue"><RevenueChart series={data.series} /></Panel>
        <Panel title="Clienti per pacchetto" testId="chart-packages"><PackagePie data={data.package_distribution} /></Panel>
        <Panel title="Utile netto mensile" className="xl:col-span-2" testId="chart-profit"><ProfitChart series={data.series} /></Panel>
        <Panel title="Classifica produttività" action={<Trophy className="h-4 w-4 text-amber-500" />} testId="leaderboard"><Leaderboard rows={data.leaderboard} /></Panel>
        <Panel title="Pagamenti in ritardo" action={<Link to="/pagamenti" className="text-xs font-semibold text-indigo-600 hover:underline" data-testid="dashboard-link-pagamenti">Gestisci</Link>}>
          <PaymentList items={data.overdue_payments} empty="Nessun pagamento in ritardo." testId="overdue-list" />
        </Panel>
        <Panel title="Scadenze nei prossimi 10 giorni">
          <PaymentList items={data.upcoming_payments} empty="Nessuna scadenza imminente." testId="upcoming-list" />
        </Panel>
        <Panel title="Operatività" action={<KanbanSquare className="h-4 w-4 text-slate-400" />}>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">Task aperti</span><span className="font-num font-bold" data-testid="ops-open-tasks">{k.task_aperti}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Da prendere in carico</span><Chip className="bg-amber-50 text-amber-700 border-amber-200">{k.task_non_assegnati}</Chip></div>
            <div className="flex justify-between"><span className="text-slate-500">Clienti attivi</span><span className="font-num font-bold">{k.clienti_attivi}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Abbonamenti attivi</span><span className="font-num font-bold">{k.abbonamenti_attivi}</span></div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
