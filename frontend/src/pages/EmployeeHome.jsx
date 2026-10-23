import { Link } from "react-router-dom";
import { CalendarDays, CheckCircle2, Clock, Hand, ListTodo } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip, EmptyState, Loading, PageHeader, Panel, StatCard } from "@/components/common";
import { useApi } from "@/lib/api";
import { CONTENT_TYPES, fmtDate, fmtDateTime, TASK_STATUS_MAP } from "@/lib/constants";
import { useAuth } from "@/context/AuthContext";

export default function EmployeeHome() {
  const { user } = useAuth();
  const { data, loading } = useApi("/me/overview");
  if (loading || !data) return <Loading />;
  return (
    <div data-testid="employee-home">
      <PageHeader
        eyebrow="La mia giornata"
        title={`Ciao ${user.name}`}
        subtitle="I tuoi task in carico, i contenuti della settimana e le ore registrate questo mese."
        actions={<Button asChild className="rounded-xl bg-indigo-600 hover:bg-indigo-700" data-testid="go-log-button"><Link to="/task"><Clock className="mr-2 h-4 w-4" />Apri WORK TO DO</Link></Button>}
      />
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Task in carico" value={data.my_tasks.length} icon={ListTodo} testId="emp-kpi-tasks" />
        <StatCard label="Completati nel mese" value={data.completed_month} icon={CheckCircle2} tone="emerald" testId="emp-kpi-completed" className="rise-1" />
        <StatCard label="Ore nel mese" value={`${data.hours_month} h`} icon={Clock} tone="amber" testId="emp-kpi-hours" className="rise-2" />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title="I miei task" action={<Link to="/task" className="text-xs font-semibold text-indigo-600 hover:underline">Apri bacheca</Link>}>
          {data.my_tasks.length === 0 ? (
            <EmptyState icon={Hand} title="Nessun task in carico" text={`Ci sono ${data.unassigned_count} task disponibili da prendere in carico.`}
              action={<Button asChild variant="outline" size="sm" data-testid="emp-take-tasks"><Link to="/task">Vai alla bacheca</Link></Button>} />
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.my_tasks.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 py-3" data-testid={`emp-task-${t.id}`}>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-800">{t.title}</p>
                    <p className="text-xs text-slate-500">{t.client_name || "Interno"} · scadenza {fmtDate(t.due_date)}</p>
                  </div>
                  <Chip className={TASK_STATUS_MAP[t.status].chip}>{TASK_STATUS_MAP[t.status].label}</Chip>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Contenuti dei prossimi 7 giorni" action={<CalendarDays className="h-4 w-4 text-slate-400" />}>
          {data.upcoming_posts.length === 0 ? (
            <p className="text-sm text-slate-500">Nessun contenuto programmato.</p>
          ) : (
            <ul className="space-y-2">
              {data.upcoming_posts.map((p) => (
                <li key={p.id} className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2.5" data-testid={`emp-post-${p.id}`}>
                  <span className={`h-2.5 w-2.5 rounded-full ${CONTENT_TYPES[p.content_type].dot}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-800">{p.title}</p>
                    <p className="text-xs text-slate-500">{p.client_name} · {CONTENT_TYPES[p.content_type].label}</p>
                  </div>
                  <span className="font-num text-xs text-slate-500">{fmtDateTime(p.scheduled_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
