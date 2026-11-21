import { useState } from "react";
import { endOfMonth, endOfQuarter, endOfYear, format, startOfMonth, startOfQuarter, startOfYear, subMonths, subQuarters } from "date-fns";
import { FileSpreadsheet, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/common";
import { downloadFile, errMsg } from "@/lib/api";

const iso = (d) => format(d, "yyyy-MM-dd");
const now = () => new Date();
const PRESETS = [
  { label: "Mese scorso", range: () => [startOfMonth(subMonths(now(), 1)), endOfMonth(subMonths(now(), 1))] },
  { label: "Trimestre scorso", range: () => [startOfQuarter(subQuarters(now(), 1)), endOfQuarter(subQuarters(now(), 1))] },
  { label: "Anno in corso", range: () => [startOfYear(now()), now()] },
  { label: "Anno scorso", range: () => [startOfYear(new Date(now().getFullYear() - 1, 0, 1)), endOfYear(new Date(now().getFullYear() - 1, 0, 1))] },
];

export default function AccountantExportDialog() {
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState(() => PRESETS[0].range().map(iso));
  const [busy, setBusy] = useState(false);
  const download = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await downloadFile("/exports/accountant", null, { date_from: range[0], date_to: range[1] });
      toast.success("File Excel scaricato");
      setOpen(false);
    } catch (err) {
      // Con responseType blob il messaggio d'errore arriva come Blob: lo rileggiamo.
      let msg = errMsg(err);
      try { msg = JSON.parse(await err.response.data.text()).detail || msg; } catch {}
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} className="rounded-xl" data-testid="accountant-export-button">
        <FileSpreadsheet className="mr-2 h-4 w-4" />Esporta per il commercialista
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="mx-4 w-[calc(100%-2rem)] max-w-md p-4 sm:p-6">
          <DialogHeader><DialogTitle>Esportazione per il commercialista</DialogTitle></DialogHeader>
          <p className="text-sm text-slate-500">
            Un file Excel con quattro fogli: riepilogo, incassi (pagamenti saldati), compensi pagati al team e spese generali del periodo.
          </p>
          <form onSubmit={download} className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <Button key={p.label} type="button" size="sm" variant="outline" onClick={() => setRange(p.range().map(iso))}>{p.label}</Button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Dal"><Input type="date" required value={range[0]} onChange={(e) => setRange([e.target.value, range[1]])} data-testid="export-from" /></Field>
              <Field label="Al"><Input type="date" required value={range[1]} onChange={(e) => setRange([range[0], e.target.value])} data-testid="export-to" /></Field>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={busy} className="w-full bg-indigo-600 hover:bg-indigo-700 sm:w-auto" data-testid="export-download">
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-2 h-4 w-4" />}Scarica Excel
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
