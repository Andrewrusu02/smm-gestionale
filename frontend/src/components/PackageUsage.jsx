import { PACKAGE_STYLE } from "@/lib/constants";
import { cn } from "@/lib/utils";

export default function PackageUsage({ usage, pkg, compact = false, testPrefix = "usage" }) {
  if (!usage) return null;
  if (!usage.length) return <p className="text-xs text-slate-500">Nessuna quota configurata nel pacchetto.</p>;
  const style = PACKAGE_STYLE[pkg] || PACKAGE_STYLE.standard;
  return (
    <div className={cn("space-y-3", compact && "space-y-2.5")}>
      {usage.map((u) => {
        const pct = u.limit ? (u.remaining / u.limit) * 100 : 0;
        const empty = u.remaining === 0;
        const low = !empty && pct <= 25;
        return (
          <div key={u.type} data-testid={`${testPrefix}-${u.type}`}>
            <div className="mb-1 flex items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-slate-700">{u.label}</span>
              <span className="flex items-center gap-1.5 font-num text-slate-500">
                <span className={cn("font-bold", empty ? "text-rose-600" : low ? "text-amber-600" : "text-slate-900")} data-testid={`${testPrefix}-${u.type}-remaining`}>
                  {u.remaining}/{u.limit}
                </span>
                rimanenti
                {empty && <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-rose-700">Esaurito</span>}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div className={cn("h-full rounded-full transition-all duration-700", empty ? "bg-rose-400" : low ? "bg-amber-500" : style.bar)} style={{ width: `${pct}%` }} />
            </div>
            {!compact && (
              <p className="mt-1 text-[11px] text-slate-400">
                {u.used} usati · {u.delivered} consegnati{u.over > 0 && <span className="font-semibold text-rose-600"> · {u.over} oltre il pacchetto</span>}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
