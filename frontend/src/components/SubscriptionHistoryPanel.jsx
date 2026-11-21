import { ArrowRight, History } from "lucide-react";
import { Chip, Panel } from "@/components/common";
import { eur, fmtDate } from "@/lib/constants";

const EVENT_STYLE = {
  start: "border-emerald-200 bg-emerald-50 text-emerald-700",
  renewal: "border-indigo-200 bg-indigo-50 text-indigo-700",
  package_change: "border-purple-200 bg-purple-50 text-purple-700",
  price_change: "border-amber-200 bg-amber-50 text-amber-800",
  stop: "border-rose-200 bg-rose-50 text-rose-700",
};

function FromTo({ from, to }) {
  if (from === to || from == null) return <span>{to ?? "—"}</span>;
  return <span className="inline-flex items-center gap-1">{from ?? "—"}<ArrowRight className="h-3 w-3 text-slate-400" />{to ?? "—"}</span>;
}

/** Storico di rinnovi e cambi di pacchetto/prezzo dell'abbonamento del cliente. */
export default function SubscriptionHistoryPanel({ items }) {
  if (!items?.length) return null;
  return (
    <Panel title="Storico abbonamento" action={<History className="h-4 w-4 text-slate-400" />} testId="subscription-history">
      <ol className="space-y-3">
        {items.map((e) => (
          <li key={e.id} className="text-sm" data-testid="subscription-history-row">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Chip className={EVENT_STYLE[e.event] || EVENT_STYLE.renewal}>{e.event_label}</Chip>
              <span className="font-num text-xs text-slate-500">{fmtDate(e.date)}</span>
            </div>
            <div className="mt-1 space-y-0.5 text-xs text-slate-600">
              {(e.from_package_label || e.to_package_label) && <p>Pacchetto: <FromTo from={e.from_package_label} to={e.to_package_label} /></p>}
              {(e.from_price != null || e.to_price != null) && (
                <p>Prezzo: <FromTo from={e.from_price != null ? eur(e.from_price) : null} to={e.to_price != null ? eur(e.to_price) : null} /> {e.billing_cycle && <span className="text-slate-400">/ {e.billing_cycle}</span>}</p>
              )}
              {(e.from_cycle || e.to_cycle) && <p>Ciclo: <FromTo from={e.from_cycle} to={e.to_cycle} /></p>}
              {e.notes && <p className="text-slate-400">{e.notes}</p>}
              {e.source === "ricostruito" && <p className="text-slate-400">Ricostruito dai pagamenti</p>}
            </div>
          </li>
        ))}
      </ol>
    </Panel>
  );
}
