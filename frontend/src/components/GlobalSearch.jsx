import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarDays, ClipboardList, FileText, KanbanSquare, Loader2, Receipt, Search, Target, Users, Video } from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/lib/api";

const ICONS = {
  client: Users, task: KanbanSquare, post: CalendarDays, payment: Receipt, quote: FileText,
  video_script: Video, lead: Target, work_log: ClipboardList,
};

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || "");

export function SearchButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex h-10 min-w-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-500 transition-colors hover:border-slate-300 sm:w-72"
      data-testid="global-search-button"
    >
      <Search className="h-4 w-4 shrink-0" />
      <span className="hidden truncate sm:inline">Cerca clienti, task, pagamenti…</span>
      <kbd className="ml-auto hidden whitespace-nowrap rounded border border-slate-200 bg-slate-50 px-1.5 font-num text-[10px] text-slate-500 sm:inline">{isMac ? "⌘" : "Ctrl"} K</kbd>
    </button>
  );
}

export default function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const last = useRef(0);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const term = q.trim();
    if (term.length < 2) { setGroups([]); setLoading(false); return undefined; }
    setLoading(true);
    const id = ++last.current;
    const timer = setTimeout(async () => {
      try {
        const { data } = await api.get("/search", { params: { q: term } });
        if (id === last.current) setGroups(data.groups || []);
      } catch {
        if (id === last.current) setGroups([]);
      } finally {
        if (id === last.current) setLoading(false);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [q, open]);

  const go = (item) => {
    setOpen(false);
    setQ("");
    navigate(item.link);
  };

  return (
    <>
      <SearchButton onClick={() => setOpen(true)} />
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQ(""); }}>
        <DialogContent className="top-[15%] max-w-xl translate-y-0 overflow-hidden p-0" data-testid="global-search-dialog">
          <DialogTitle className="sr-only">Ricerca globale</DialogTitle>
          <Command shouldFilter={false} className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-slate-500 [&_[cmdk-input]]:h-12">
            <CommandInput value={q} onValueChange={setQ} placeholder="Cerca clienti, task, contenuti, pagamenti, preventivi, script, lead…" data-testid="global-search-input" />
            <CommandList className="max-h-[60vh]">
              {loading && <div className="flex items-center gap-2 px-4 py-3 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Ricerca…</div>}
              {!loading && q.trim().length >= 2 && <CommandEmpty>Nessun risultato per «{q.trim()}»</CommandEmpty>}
              {q.trim().length < 2 && <div className="px-4 py-6 text-center text-sm text-slate-500">Scrivi almeno 2 lettere. Usa ↑ ↓ per muoverti e Invio per aprire.</div>}
              {groups.map((g) => {
                const Icon = ICONS[g.type] || Search;
                return (
                  <CommandGroup key={g.type} heading={g.label}>
                    {g.items.map((item) => (
                      <CommandItem key={`${g.type}-${item.id}`} value={`${g.type}-${item.id}`} onSelect={() => go(item)} className="cursor-pointer gap-3" data-testid={`search-result-${g.type}`}>
                        <Icon className="h-4 w-4 shrink-0 text-slate-400" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-900">{item.title}</p>
                          {item.subtitle && <p className="truncate text-xs text-slate-500">{item.subtitle}</p>}
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                );
              })}
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}
