import { useEffect, useState } from "react";
import { Loader2, Tags } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/common";
import { api, errMsg, useApi } from "@/lib/api";
import { SERVICE_CATEGORIES } from "@/pages/TaskFormDialog";

/** Listino personalizzato del cliente: precompila il prezzo dei lavori extra per categoria. */
export default function PriceListPanel({ clientId }) {
  const { data, reload } = useApi(`/clients/${clientId}/price-list`);
  const [prices, setPrices] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (data) setPrices(Object.fromEntries(data.map((r) => [r.category_service, r.price])));
  }, [data]);
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const items = Object.entries(prices)
        .filter(([, v]) => v !== "" && v !== null && v !== undefined)
        .map(([category_service, price]) => ({ category_service, price: Number(price) }));
      await api.put(`/clients/${clientId}/price-list`, { items });
      toast.success("Listino salvato");
      reload();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel title="Listino personalizzato" action={<Tags className="h-4 w-4 text-slate-400" />} testId="price-list-panel">
      <p className="mb-3 text-xs text-slate-500">Prezzi dei lavori extra per questo cliente. Precompilano il prezzo di listino quando crei un lavoro; lascia vuoto per non usarlo.</p>
      <form onSubmit={save} className="space-y-2">
        {SERVICE_CATEGORIES.map(([key, label]) => (
          <label key={key} className="flex items-center justify-between gap-3 text-sm">
            <span className="text-slate-700">{label}</span>
            <Input type="number" min="0" step="0.01" placeholder="—" value={prices[key] ?? ""} className="h-9 w-28 text-right"
              onChange={(e) => setPrices((p) => ({ ...p, [key]: e.target.value }))} data-testid={`price-list-${key}`} />
          </label>
        ))}
        <Button type="submit" size="sm" disabled={busy} className="mt-2 bg-indigo-600 hover:bg-indigo-700" data-testid="price-list-save">
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salva listino
        </Button>
      </form>
    </Panel>
  );
}
