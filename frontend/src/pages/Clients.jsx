import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Plus, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Chip, EmptyState, Loading, PageHeader } from "@/components/common";
import PackageUsage from "@/components/PackageUsage";
import ClientFormDialog from "@/pages/ClientFormDialog";
import { useApi } from "@/lib/api";
import { eur, PACKAGE_STYLE } from "@/lib/constants";
import { cn } from "@/lib/utils";

const TABS = [["tutti", "Tutti"], ["abbonamento", "Con abbonamento"]];

function ClientCard({ c, onOpen }) {
  const style = c.package ? PACKAGE_STYLE[c.package] : null;
  return (
    <button onClick={onOpen} data-testid={`client-card-${c.id}`}
      className={cn("group rounded-2xl border border-slate-200/80 bg-white p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md rise", !c.active && "opacity-60")}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-bold text-slate-900">{c.name}</p>
          <p className="truncate text-xs text-slate-500">{c.contact_name || c.email || "—"}</p>
        </div>
        {style && <Chip className={style.chip}>{`${style.label} · ${eur(c.package_info?.price)}`}</Chip>}
      </div>
      {c.credits_exhausted && <Chip className="mb-3 border-rose-200 bg-rose-50 text-rose-700" testId={`client-${c.id}-exhausted`}>Crediti esauriti · da rinnovare</Chip>}
      {c.package ? (
        <PackageUsage usage={c.usage} pkg={c.package} compact testPrefix={`client-${c.id}-usage`} />
      ) : (
        <div className="space-y-2 text-sm">
          <p className="line-clamp-2 text-slate-600">{c.notes || "Anagrafica cliente senza abbonamento attivo."}</p>
          <div className="flex items-center justify-between pt-2">
            <span className="font-num text-lg font-bold text-amber-700">Saldo {eur(c.balance)}</span>
            <Chip className="border-slate-200 bg-slate-50 text-slate-600">{c.open_tasks} task aperti</Chip>
          </div>
        </div>
      )}
      <div className="mt-4 flex items-center gap-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
        <span>{c.open_tasks} task aperti</span>
        {c.overdue_count > 0 && <span className="flex items-center gap-1 font-semibold text-rose-600"><AlertTriangle className="h-3 w-3" />{c.overdue_count} in ritardo</span>}
        {!c.active && <span className="ml-auto font-semibold">Disattivato</span>}
      </div>
    </button>
  );
}

export default function Clients() {
  const { data, loading, reload } = useApi("/clients");
  const [tab, setTab] = useState("tutti");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const list = useMemo(() => (data || []).filter((c) =>
    (tab === "tutti" || (tab === "abbonamento" && c.package)) && c.name.toLowerCase().includes(q.toLowerCase())), [data, tab, q]);

  return (
    <div data-testid="clients-page">
      <PageHeader eyebrow="Anagrafica" title="Clienti" subtitle="Anagrafiche neutre con abbonamenti e lavori singoli associati."
        actions={<Button onClick={() => setOpen(true)} className="rounded-xl bg-indigo-600 hover:bg-indigo-700" data-testid="add-client-button"><Plus className="mr-2 h-4 w-4" />Nuovo cliente</Button>} />
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex rounded-xl bg-slate-200/60 p-1">
          {TABS.map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} data-testid={`clients-tab-${k}`}
              className={cn("rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors", tab === k ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700")}>{l}</button>
          ))}
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input placeholder="Cerca cliente..." value={q} onChange={(e) => setQ(e.target.value)} className="bg-white pl-9" data-testid="clients-search-input" />
        </div>
      </div>
      {loading ? <Loading /> : list.length === 0 ? (
        <EmptyState icon={Users} title="Nessun cliente" text="Aggiungi il primo cliente per iniziare a pianificare contenuti e incassi." testId="clients-empty"
          action={<Button onClick={() => setOpen(true)} variant="outline">Aggiungi cliente</Button>} />
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {list.map((c) => <ClientCard key={c.id} c={c} onOpen={() => navigate(`/clienti/${c.id}`)} />)}
        </div>
      )}
      <ClientFormDialog open={open} onOpenChange={setOpen} onSaved={reload} />
    </div>
  );
}
