import { useMemo, useState } from "react";
import { CalendarClock, Mail, Phone, Plus, Search, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Chip, EmptyState, Loading, PageHeader, StatCard } from "@/components/common";
import LeadFormDialog from "@/pages/LeadFormDialog";
import { useApi } from "@/lib/api";
import { fmtDateTime, LEAD_STATUS, parseDate } from "@/lib/constants";
import { cn } from "@/lib/utils";

const TABS = [["attivi", "Attivi"], ["convertito", "Convertiti"], ["perso", "Persi"], ["tutti", "Tutti"]];

function LeadRow({ l, onOpen }) {
  const upcoming = l.meeting_at && parseDate(l.meeting_at) >= new Date();
  return (
    <button onClick={onOpen} data-testid={`lead-row-${l.id}`}
      className="flex w-full flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md sm:flex-row sm:items-center rise">
      <div className={cn("flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl", upcoming ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500")}>
        {l.meeting_at ? <>
          <span className="font-num text-base font-bold leading-none">{parseDate(l.meeting_at).getDate()}</span>
          <span className="text-[10px] uppercase">{parseDate(l.meeting_at).toLocaleDateString("it-IT", { month: "short" })}</span>
        </> : <CalendarClock className="h-5 w-5" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-bold text-slate-900">{l.name}</p>
        <p className="flex flex-wrap gap-x-4 text-xs text-slate-500">
          {l.contact_name && <span>{l.contact_name}</span>}
          {l.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{l.email}</span>}
          {l.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{l.phone}</span>}
        </p>
        {l.notes && <p className="mt-1 line-clamp-1 text-xs text-slate-400">{l.notes}</p>}
      </div>
      <div className="flex flex-col items-start gap-1 sm:items-end">
        <Chip className={LEAD_STATUS[l.status].chip} testId={`lead-status-${l.id}`}>{LEAD_STATUS[l.status].label}</Chip>
        <span className="font-num text-xs text-slate-500">{l.meeting_at ? fmtDateTime(l.meeting_at) : "Nessun appuntamento"}</span>
      </div>
    </button>
  );
}

export default function Leads() {
  const { data, loading, reload } = useApi("/leads");
  const [tab, setTab] = useState("attivi");
  const [q, setQ] = useState("");
  const [dialog, setDialog] = useState({ open: false, lead: null });

  const list = useMemo(() => (data || []).filter((l) =>
    (tab === "tutti" || (tab === "attivi" ? !["convertito", "perso"].includes(l.status) : l.status === tab)) &&
    l.name.toLowerCase().includes(q.toLowerCase())), [data, tab, q]);
  const stats = useMemo(() => {
    const all = data || [];
    const now = new Date();
    return {
      upcoming: all.filter((l) => l.meeting_at && parseDate(l.meeting_at) >= now && !["convertito", "perso"].includes(l.status)).length,
      active: all.filter((l) => !["convertito", "perso"].includes(l.status)).length,
      converted: all.filter((l) => l.status === "convertito").length,
      rate: all.length ? Math.round((all.filter((l) => l.status === "convertito").length / all.length) * 100) : 0,
    };
  }, [data]);

  return (
    <div data-testid="leads-page">
      <PageHeader eyebrow="CRM" title="Lead & appuntamenti" subtitle="Meeting commerciali con potenziali clienti. Gli appuntamenti compaiono nel calendario come Meeting e si sincronizzano con Google Calendar."
        actions={<Button onClick={() => setDialog({ open: true, lead: null })} className="rounded-xl bg-indigo-600 hover:bg-indigo-700" data-testid="add-lead-button"><Plus className="mr-2 h-4 w-4" />Nuovo lead</Button>} />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Meeting in arrivo" value={stats.upcoming} icon={CalendarClock} testId="leads-kpi-upcoming" />
        <StatCard label="Lead attivi" value={stats.active} icon={Target} tone="amber" testId="leads-kpi-active" className="rise-1" />
        <StatCard label="Convertiti" value={stats.converted} tone="emerald" testId="leads-kpi-converted" className="rise-2" />
        <StatCard label="Tasso conversione" value={`${stats.rate}%`} tone="slate" testId="leads-kpi-rate" className="rise-3" />
      </div>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex rounded-xl bg-slate-200/60 p-1">
          {TABS.map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} data-testid={`leads-tab-${k}`}
              className={cn("rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors", tab === k ? "bg-white text-slate-900 shadow-sm" : "text-slate-500")}>{l}</button>
          ))}
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input placeholder="Cerca lead..." value={q} onChange={(e) => setQ(e.target.value)} className="bg-white pl-9" data-testid="leads-search-input" />
        </div>
      </div>
      {loading && !data ? <Loading /> : list.length === 0 ? (
        <EmptyState icon={Target} title="Nessun lead" text="Registra un potenziale cliente e fissa il primo appuntamento." testId="leads-empty" />
      ) : (
        <div className="space-y-3">{list.map((l) => <LeadRow key={l.id} l={l} onOpen={() => setDialog({ open: true, lead: l })} />)}</div>
      )}
      <LeadFormDialog open={dialog.open} onOpenChange={(o) => setDialog((d) => ({ ...d, open: o }))} lead={dialog.lead} onSaved={reload} />
    </div>
  );
}
