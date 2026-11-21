import { useState } from "react";
import { FileDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { downloadFile, errMsg } from "@/lib/api";
import { currentPeriod } from "@/lib/constants";

/** Scarica il report mensile in PDF del cliente per il mese scelto. */
export default function ClientReportButton({ clientId }) {
  const [period, setPeriod] = useState(currentPeriod);
  const [busy, setBusy] = useState(false);
  const download = async () => {
    const [year, month] = period.split("-");
    setBusy(true);
    try {
      await downloadFile(`/clients/${clientId}/report.pdf`, null, { year, month: Number(month) });
      toast.success("Report scaricato");
    } catch (err) {
      let msg = errMsg(err);
      try { msg = JSON.parse(await err.response.data.text()).detail || msg; } catch {}
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" data-testid="client-report-button"><FileDown className="mr-2 h-4 w-4" />Report PDF</Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 space-y-3">
        <p className="text-sm font-semibold">Report mensile per il cliente</p>
        <p className="text-xs text-slate-500">Contenuti consegnati, crediti usati e rimasti, lavori extra e prossime uscite.</p>
        <Input type="month" value={period} onChange={(e) => e.target.value && setPeriod(e.target.value)} data-testid="client-report-month" />
        <Button onClick={download} disabled={busy} className="w-full bg-indigo-600 hover:bg-indigo-700" data-testid="client-report-download">
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}Scarica PDF
        </Button>
      </PopoverContent>
    </Popover>
  );
}
