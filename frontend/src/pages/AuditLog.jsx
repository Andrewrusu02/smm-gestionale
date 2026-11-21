import { useState } from "react";
import { ArrowRight, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Chip, EmptyState, Field, Loading, NativeSelect, PageHeader, Panel } from "@/components/common";
import { qs, useApi } from "@/lib/api";
import { fmtDateTime } from "@/lib/constants";

const ACTION_STYLE = {
  create: "border-emerald-200 bg-emerald-50 text-emerald-700",
  update: "border-sky-200 bg-sky-50 text-sky-700",
  delete: "border-rose-200 bg-rose-50 text-rose-700",
  restore: "border-indigo-200 bg-indigo-50 text-indigo-700",
  purge: "border-rose-200 bg-rose-100 text-rose-800",
};

export const FIELD_LABELS = {
  amount: "Importo", status: "Stato", due_date: "Scadenza", paid_date: "Data pagamento", description: "Descrizione",
  invoice_number: "N. fattura", notes: "Note", period: "Periodo", kind: "Tipo", client_id: "Cliente", task_id: "Task",
  worker_expense: "Compenso", revenue_amount: "Entrata cliente", team_paid: "Saldato al collaboratore",
  team_paid_at: "Data saldo", hours: "Ore", date: "Data", user_id: "Collaboratore", title: "Titolo", name: "Nome",
  package: "Pacchetto", price_charged_to_client: "Prezzo al cliente", assigned_to_id: "Assegnato a", priority: "Priorità",
  completed_at: "Completato il", deleted_at: "Eliminato il", active: "Attivo", email: "Email", phone: "Telefono",
  start_date: "Data inizio", custom_price: "Prezzo personalizzato", cycle_number: "Ciclo",
};

const fmtValue = (v) => {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Sì" : "No";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) return fmtDateTime(v);
  return String(v);
};

function Diff({ item }) {
  const before = item.before || {};
  const after = item.after || {};
  // Modifiche: solo i campi cambiati. Creazioni ed eliminazioni definitive: i campi principali dell'elemento.
  const full = !item.before || !item.after;
  const keys = full
    ? Object.keys(item.after || item.before).filter((k) => !["id", "created_at", "updated_at"].includes(k) && (item.after || item.before)[k] != null)
    : Object.keys(after);
  const shown = keys.slice(0, full ? 8 : 50);
  if (!shown.length) return <span className="text-slate-400">—</span>;
  return (
    <ul className="space-y-0.5 text-xs">
      {shown.map((k) => (
        <li key={k} className="flex flex-wrap items-center gap-1">
          <span className="font-semibold text-slate-600">{FIELD_LABELS[k] || k}:</span>
          {!full && k in before && <span className="text-slate-500 line-through decoration-slate-300">{fmtValue(before[k])}</span>}
          {!full && <ArrowRight className="h-3 w-3 text-slate-400" />}
          <span className="text-slate-900">{fmtValue(full ? (item.after || item.before)[k] : after[k])}</span>
        </li>
      ))}
      {keys.length > shown.length && <li className="text-slate-400">… altri {keys.length - shown.length} campi</li>}
    </ul>
  );
}

export default function AuditLog() {
  const [filters, setFilters] = useState({ entity: "", user_id: "", date_from: "", date_to: "" });
  const [limit, setLimit] = useState(100);
  const { data, loading } = useApi(`/audit${qs({ ...filters, limit })}`);
  const { data: users } = useApi("/users/basic");
  const set = (k) => (e) => { setLimit(100); setFilters((f) => ({ ...f, [k]: e.target.value })); };
  return (
    <div data-testid="audit-page">
      <PageHeader eyebrow="Controllo" title="Registro modifiche" subtitle="Chi ha creato, modificato o eliminato pagamenti, lavori e compensi, clienti e task." />
      <Panel className="mb-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Entità">
            <NativeSelect value={filters.entity} onChange={set("entity")} data-testid="audit-filter-entity">
              <option value="">Tutte</option>
              {(data?.entities || []).map((e) => <option key={e.key} value={e.key}>{e.label}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Utente">
            <NativeSelect value={filters.user_id} onChange={set("user_id")} data-testid="audit-filter-user">
              <option value="">Tutti</option>
              {(users || []).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Dal"><Input type="date" value={filters.date_from} onChange={set("date_from")} data-testid="audit-filter-from" /></Field>
          <Field label="Al"><Input type="date" value={filters.date_to} onChange={set("date_to")} data-testid="audit-filter-to" /></Field>
        </div>
      </Panel>
      {loading && !data ? <Loading /> : !data?.items?.length ? (
        <EmptyState icon={History} title="Nessuna modifica" text="Non ci sono modifiche registrate con questi filtri." />
      ) : (
        <Panel title={`${data.total} modific${data.total === 1 ? "a" : "he"}`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wider text-slate-500">
                  <th className="px-2 py-2">Data e ora</th><th className="px-2 py-2">Utente</th><th className="px-2 py-2">Elemento</th>
                  <th className="px-2 py-2">Azione</th><th className="px-2 py-2">Valori</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((i) => (
                  <tr key={i.id} className="align-top" data-testid="audit-row">
                    <td className="whitespace-nowrap px-2 py-3 font-num text-xs text-slate-600">{fmtDateTime(i.created_at + "Z")}</td>
                    <td className="px-2 py-3 text-slate-700">{i.user_name || "Sistema"}</td>
                    <td className="px-2 py-3">
                      <p className="font-semibold text-slate-900">{i.entity_label} #{i.entity_id}</p>
                      {i.summary && <p className="max-w-[16rem] truncate text-xs text-slate-500">{i.summary}</p>}
                    </td>
                    <td className="px-2 py-3"><Chip className={ACTION_STYLE[i.action] || ACTION_STYLE.update}>{i.action_label}</Chip></td>
                    <td className="px-2 py-3"><Diff item={i} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.total > data.items.length && (
            <div className="mt-4 text-center">
              <Button variant="outline" onClick={() => setLimit((l) => l + 100)} disabled={loading} data-testid="audit-load-more">Carica altre</Button>
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}
