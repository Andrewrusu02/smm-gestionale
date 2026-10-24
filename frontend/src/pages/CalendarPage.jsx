import { useEffect, useMemo, useState } from "react";
import {
  addDays, addMonths, addWeeks, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, isToday, startOfMonth, startOfWeek,
} from "date-fns";
import { it } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Plus, RefreshCw, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Chip, NativeSelect, PageHeader } from "@/components/common";
import PostFormDialog from "@/pages/PostFormDialog";
import LeadFormDialog from "@/pages/LeadFormDialog";
import { useAuth } from "@/context/AuthContext";
import { api, errMsg, qs, useApi } from "@/lib/api";
import { CATEGORIES, categoryOf, CONTENT_TYPES, fmtTime, MEETING_STYLE, parseDate } from "@/lib/constants";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

function PostPill({ p, onClick, full }) {
  const t = CATEGORIES[categoryOf(p.content_type)];
  const ct = CONTENT_TYPES[p.content_type];
  return (
    <button onClick={(e) => { e.stopPropagation(); onClick(p); }} data-testid={`calendar-post-${p.id}`} data-category={categoryOf(p.content_type)}
      className={cn("flex w-full items-center gap-1.5 truncate rounded-md border px-1.5 py-1 text-left text-[11px] font-medium transition-transform hover:scale-[1.02]", t.chip, p.status === "consegnato" && "opacity-60 line-through")}>
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", t.dot)} />
      <span className="font-num shrink-0">{fmtTime(p.scheduled_at)}</span>
      {p.content_type !== "sessione" && <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider opacity-70">{ct.label}</span>}
      {p.content_type === "sessione" && <span className="shrink-0 rounded bg-emerald-200/70 px-1 text-[9px] font-bold uppercase tracking-wider">Riprese</span>}
      <span className="truncate">{full ? `${p.client_name} · ${p.title}` : p.client_name}</span>
    </button>
  );
}

function MeetingPill({ m, onClick, full }) {
  return (
    <button onClick={(e) => { e.stopPropagation(); onClick(m); }} data-testid={`calendar-meeting-${m.id}`}
      className={cn("flex w-full items-center gap-1.5 truncate rounded-md border px-1.5 py-1 text-left text-[11px] font-medium transition-transform hover:scale-[1.02]", MEETING_STYLE.chip)}>
      <Users className="h-3 w-3 shrink-0" />
      <span className="font-num shrink-0">{fmtTime(m.meeting_at)}</span>
      <span className="shrink-0 rounded bg-white/20 px-1 text-[9px] font-bold uppercase tracking-wider">Meeting</span>
      <span className="truncate">{full ? `${m.name}${m.contact_name ? ` · ${m.contact_name}` : ""}` : m.name}</span>
    </button>
  );
}

function TaskPill({ task, full }) {
  const value = task.start_date || task.due_date;
  const title = task.title || task.name || task.category_service || "Attività";
  return <div className="flex w-full items-center gap-1 truncate rounded-md border border-amber-200 bg-amber-50 px-1.5 py-1 text-[11px] text-amber-800" data-testid={`calendar-task-${task.id}`}>
    <span className="font-num shrink-0">{value?.slice(5)}</span><span className="truncate">{full ? `${task.client_name ? `${task.client_name} · ` : ""}${title}` : title}</span>
  </div>;
}

function GoogleBadge() {
  const { data, reload } = useApi("/integrations/google");
  const [busy, setBusy] = useState(false);
  if (!data) return null;
  const sync = async () => {
    setBusy(true);
    try {
      const r = await api.post("/integrations/google/sync");
      toast.success(`Sincronizzato: ${r.data.pushed} inviati, ${r.data.pulled} aggiornati da Google`);
      reload();
      window.dispatchEvent(new Event("posts:reload"));
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  return data.connected ? (
    <Button variant="outline" onClick={sync} disabled={busy} data-testid="google-sync-button">
      <RefreshCw className={cn("mr-2 h-4 w-4", busy && "animate-spin")} />Sincronizza Google
    </Button>
  ) : (
    <Chip className="border-slate-200 bg-white text-slate-500" testId="google-sync-status">Google Calendar non collegato</Chip>
  );
}

export default function CalendarPage() {
  const { isAdmin } = useAuth();
  const [cursor, setCursor] = useState(new Date());
  const [view, setView] = useState("month");
  const [clientId, setClientId] = useState("");
  const [cats, setCats] = useState([]);
  const [typeSel, setTypeSel] = useState("");
  const [dialog, setDialog] = useState({ open: false, post: null, date: null });
  const [leadDialog, setLeadDialog] = useState({ open: false, lead: null, date: null });
  const { data: clients } = useApi("/clients/basic");

  const range = useMemo(() => view === "month"
    ? { start: startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 }), end: endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 }) }
    : { start: startOfWeek(cursor, { weekStartsOn: 1 }), end: endOfWeek(cursor, { weekStartsOn: 1 }) }, [cursor, view]);
  const days = eachDayOfInterval(range);
  const showCat = (k) => cats.length === 0 || cats.includes(k);
  const showMeetings = isAdmin && !clientId && showCat("meeting");
  const startISO = format(range.start, "yyyy-MM-dd");
  const endISO = format(range.end, "yyyy-MM-dd");
  const path = `/posts${qs({ start: startISO, end: endISO, client_id: clientId, content_type: typeSel })}`;
  const { data: posts, reload } = useApi(path);
  const { data: tasks, reload: reloadTasks } = useApi(`/tasks${qs({ client_id: clientId })}`);
  const { data: meetings, reload: reloadMeetings } = useApi(isAdmin ? `/leads?start=${startISO}&end=${endISO}` : null);

  useEffect(() => {
    const h = () => { reload(); reloadTasks(); if (isAdmin) reloadMeetings(); };
    window.addEventListener("posts:reload", h);
    return () => window.removeEventListener("posts:reload", h);
  }, [reload, reloadTasks, reloadMeetings, isAdmin]);

  const byDay = (d) => [
    ...(posts || []).filter((p) => showCat(categoryOf(p.content_type)) && isSameDay(parseDate(p.scheduled_at), d)).map((p) => ({ kind: "post", at: p.scheduled_at, item: p })),
    ...(showMeetings ? (meetings || []).filter((m) => m.meeting_at && isSameDay(parseDate(m.meeting_at), d)).map((m) => ({ kind: "meeting", at: m.meeting_at, item: m })) : []),
    ...(tasks || []).filter((t) => (t.start_date || t.due_date) && isSameDay(parseDate(t.start_date || t.due_date), d)).map((t) => ({ kind: "task", at: `${t.start_date || t.due_date}T00:00:00`, item: t })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  const openMeeting = (m) => setLeadDialog({ open: true, lead: m, date: null });
  const move = (dir) => setCursor((c) => (view === "month" ? addMonths(c, dir) : addWeeks(c, dir)));
  const toggleCat = (k) => setCats((t) => (t.includes(k) ? t.filter((x) => x !== k) : [...t, k]));
  const openNew = (d) => isAdmin && setDialog({ open: true, post: null, date: d });
  const openPost = (p) => setDialog({ open: true, post: p, date: null });

  const title = view === "month"
    ? format(cursor, "LLLL yyyy", { locale: it })
    : `${format(range.start, "d MMM", { locale: it })} – ${format(range.end, "d MMM yyyy", { locale: it })}`;

  return (
    <div data-testid="calendar-page">
      <PageHeader eyebrow="Piano editoriale" title="Calendario" subtitle="Contenuti programmati per tutti i clienti. Ogni contenuto genera automaticamente il relativo task nella To-Do list."
        actions={<>
          {isAdmin && <GoogleBadge />}
          {isAdmin && <Button variant="outline" onClick={() => setLeadDialog({ open: true, lead: null, date: format(new Date(), "yyyy-MM-dd") })} data-testid="add-meeting-button"><Users className="mr-2 h-4 w-4" />Nuovo meeting</Button>}
          {isAdmin && <Button onClick={() => openNew(new Date())} className="rounded-xl bg-indigo-600 hover:bg-indigo-700" data-testid="add-post-button"><Plus className="mr-2 h-4 w-4" />Nuovo contenuto</Button>}
        </>} />
      <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => move(-1)} data-testid="calendar-prev"><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="outline" size="icon" onClick={() => move(1)} data-testid="calendar-next"><ChevronRight className="h-4 w-4" /></Button>
          <Button variant="ghost" onClick={() => setCursor(new Date())} data-testid="calendar-today">Oggi</Button>
          <h2 className="ml-2 text-xl font-bold capitalize" data-testid="calendar-title">{title}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <NativeSelect value={clientId} onChange={(e) => setClientId(e.target.value)} className="w-48" data-testid="calendar-client-filter">
            <option value="">Tutti i clienti</option>
            {(clients || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </NativeSelect>
          <div className="inline-flex rounded-xl bg-slate-200/60 p-1">
            {[["month", "Mese"], ["week", "Settimana"]].map(([k, l]) => (
              <button key={k} onClick={() => setView(k)} data-testid={`calendar-view-${k}`}
                className={cn("rounded-lg px-3 py-1.5 text-sm font-semibold", view === k ? "bg-white shadow-sm" : "text-slate-500")}>{l}</button>
            ))}
          </div>
        </div>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {Object.entries(CATEGORIES).filter(([k]) => isAdmin || k !== "meeting").map(([k, t]) => (
          <button key={k} onClick={() => toggleCat(k)} data-testid={`calendar-category-filter-${k}`}
            className={cn("flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors", cats.includes(k) ? t.chip : "border-slate-200 bg-white text-slate-600 hover:border-slate-300")}>
            <span className={cn("h-2.5 w-2.5 rounded-full", t.dot, cats.includes(k) && k === "meeting" && "bg-white")} />{t.label}
          </button>
        ))}
        <NativeSelect value={typeSel} onChange={(e) => setTypeSel(e.target.value)} className="h-8 w-52 text-xs" data-testid="calendar-type-select">
          <option value="">Tutte le tipologie</option>
          {Object.entries(CONTENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </NativeSelect>
        {(cats.length > 0 || typeSel) && <button onClick={() => { setCats([]); setTypeSel(""); }} className="text-xs font-semibold text-indigo-600" data-testid="calendar-clear-types">Azzera filtri</button>}
      </div>
      <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        <div className="grid min-w-[760px] grid-cols-7 border-b border-slate-100 bg-slate-50/60">
          {WEEKDAYS.map((d, i) => <div key={d} className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{view === "week" ? `${d} ${format(addDays(range.start, i), "d")}` : d}</div>)}
        </div>
        <div className="grid min-w-[760px] grid-cols-7" data-testid={`calendar-grid-${view}`}>
          {days.map((d) => {
            const items = byDay(d);
            const limit = view === "month" ? 3 : 50;
            return (
              <div key={d.toISOString()} onClick={() => openNew(d)} data-testid={`calendar-day-${format(d, "yyyy-MM-dd")}`}
                className={cn("group border-b border-r border-slate-100 p-1.5 transition-colors", view === "month" ? "min-h-[118px]" : "min-h-[420px]",
                  isAdmin && "cursor-pointer hover:bg-indigo-50/40", view === "month" && !isSameMonth(d, cursor) && "bg-slate-50/70")}>
                {view === "month" && (
                  <span className={cn("font-num mb-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs", isToday(d) ? "bg-indigo-600 font-bold text-white" : isSameMonth(d, cursor) ? "text-slate-700" : "text-slate-300")}>{format(d, "d")}</span>
                )}
                {view === "week" && isToday(d) && <span className="mb-1 block text-[10px] font-bold uppercase text-indigo-600">Oggi</span>}
                <div className="space-y-1">
                  {items.slice(0, limit).map((e) => e.kind === "post"
                    ? <PostPill key={`p${e.item.id}`} p={e.item} onClick={openPost} full={view === "week"} />
                    : e.kind === "meeting" ? <MeetingPill key={`m${e.item.id}`} m={e.item} onClick={openMeeting} full={view === "week"} /> : <TaskPill key={`t${e.item.id}`} task={e.item} full={view === "week"} />)}
                  {items.length > limit && <p className="px-1 text-[11px] font-semibold text-slate-500">+{items.length - limit} altri</p>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <PostFormDialog open={dialog.open} onOpenChange={(o) => setDialog((s) => ({ ...s, open: o }))} post={dialog.post} defaultDate={dialog.date}
        clients={clients || []} isAdmin={isAdmin} onSaved={reload} />
      {isAdmin && <LeadFormDialog open={leadDialog.open} onOpenChange={(o) => setLeadDialog((s) => ({ ...s, open: o }))} lead={leadDialog.lead} defaultDate={leadDialog.date} onSaved={reloadMeetings} />}
    </div>
  );
}
