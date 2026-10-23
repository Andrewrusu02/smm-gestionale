import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, CheckCircle2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

const DOT = { high: "bg-rose-500", medium: "bg-amber-500", low: "bg-indigo-400" };

export default function NotificationsBell() {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const load = () => api.get("/notifications").then((r) => setItems(r.data)).catch(() => {});
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (open) api.get("/notifications").then((r) => setItems(r.data)).catch(() => {});
  }, [open]);

  const urgent = items.filter((i) => i.severity !== "low").length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="relative rounded-xl p-2.5 text-slate-600 transition-colors hover:bg-slate-200/60" data-testid="notifications-bell">
          <Bell className="h-5 w-5" />
          {urgent > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white" data-testid="notifications-count">
              {urgent}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] p-0" data-testid="notifications-panel">
        <div className="border-b px-4 py-3">
          <p className="text-sm font-bold">Notifiche</p>
        </div>
        <div className="max-h-[420px] overflow-y-auto">
          {items.length === 0 ? (
            <div className="flex flex-col items-center py-10 text-sm text-slate-500">
              <CheckCircle2 className="mb-2 h-6 w-6 text-emerald-500" />
              Tutto in ordine, nessuna notifica.
            </div>
          ) : (
            items.map((n) => (
              <button
                key={n.id}
                data-testid={`notification-${n.id}`}
                onClick={() => { setOpen(false); navigate(n.link); }}
                className="flex w-full gap-3 border-b border-slate-100 px-4 py-3 text-left transition-colors hover:bg-slate-50"
              >
                <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", DOT[n.severity])} />
                <span>
                  <span className="block text-sm font-semibold text-slate-800">{n.title}</span>
                  <span className="block text-xs text-slate-500">{n.message}</span>
                </span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
