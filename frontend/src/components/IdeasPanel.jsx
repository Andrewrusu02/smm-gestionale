import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ExternalLink, Lightbulb, Loader2, Pencil, Plus, Trash2, Wand2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Chip, ConfirmDialog, NativeSelect, Panel } from "@/components/common";
import { useAuth } from "@/context/AuthContext";
import { api, errMsg, qs, useApi } from "@/lib/api";
import { fmtDate } from "@/lib/constants";

const STATUS_STYLE = {
  nuova: "border-sky-200 bg-sky-50 text-sky-700",
  approvata: "border-emerald-200 bg-emerald-50 text-emerald-700",
  scartata: "border-slate-200 bg-slate-100 text-slate-500",
  convertita: "border-indigo-200 bg-indigo-50 text-indigo-700",
};
const EMPTY = { title: "", note: "", reference_url: "", status: "nuova" };

/** Banca idee per cliente. Con clientId fisso (scheda cliente) oppure con scelta del cliente. */
export default function IdeasPanel({ clientId, clients }) {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [filterClient, setFilterClient] = useState("");
  const activeClient = clientId || filterClient;
  const { data: ideas, reload } = useApi(`/ideas${qs({ client_id: activeClient })}`);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState("");

  const save = async (e) => {
    e.preventDefault();
    const cid = clientId || form.client_id;
    if (!cid) return toast.error("Scegli il cliente");
    setBusy("save");
    const body = { client_id: Number(cid), title: form.title, note: form.note || null, reference_url: form.reference_url || null, status: form.status };
    try {
      if (form.id) await api.put(`/ideas/${form.id}`, body);
      else await api.post("/ideas", body);
      toast.success(form.id ? "Idea aggiornata" : "Idea salvata");
      setForm(null);
      reload();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy("");
    }
  };
  const toScript = async (idea) => {
    setBusy(`s${idea.id}`);
    try {
      const { data } = await api.post(`/ideas/${idea.id}/to-script`);
      toast.success("Script creato dall'idea");
      window.dispatchEvent(new Event("scripts:reload"));
      navigate(`/script-idee?id=${data.script.id}`);
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy("");
    }
  };
  const remove = async (idea) => {
    try { await api.delete(`/ideas/${idea.id}`); toast.success("Idea eliminata"); reload(); } catch (err) { toast.error(errMsg(err)); }
  };
  const quickStatus = async (idea, status) => {
    try {
      await api.put(`/ideas/${idea.id}`, { client_id: idea.client_id, title: idea.title, note: idea.note, reference_url: idea.reference_url, status });
      reload();
    } catch (err) { toast.error(errMsg(err)); }
  };
  const canEdit = (i) => isAdmin || i.created_by === user.id;

  return (
    <Panel
      title="Banca idee"
      testId="ideas-panel"
      action={<div className="flex items-center gap-2">
        {!clientId && clients && (
          <NativeSelect value={filterClient} onChange={(e) => setFilterClient(e.target.value)} className="h-9 w-44">
            <option value="">Tutti i clienti</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </NativeSelect>
        )}
        <Button size="sm" onClick={() => setForm({ ...EMPTY, client_id: activeClient || "" })} className="bg-indigo-600 hover:bg-indigo-700" data-testid="idea-new"><Plus className="mr-1 h-4 w-4" />Idea</Button>
      </div>}
    >
      {form && (
        <form onSubmit={save} className="mb-4 space-y-2 rounded-xl border border-indigo-200 bg-indigo-50/50 p-3" data-testid="idea-form">
          {!clientId && (
            <NativeSelect required value={form.client_id} onChange={(e) => setForm({ ...form, client_id: e.target.value })}>
              <option value="">Cliente…</option>
              {(clients || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </NativeSelect>
          )}
          <Input required autoFocus placeholder="Titolo dell'idea" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} data-testid="idea-title" />
          <Textarea rows={2} placeholder="Nota (diventa il concept dello script)" value={form.note || ""} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          <Input type="url" placeholder="Link di riferimento (https://…)" value={form.reference_url || ""} onChange={(e) => setForm({ ...form, reference_url: e.target.value })} />
          <div className="flex items-center justify-between gap-2">
            {form.id ? (
              <NativeSelect value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="h-9 w-40">
                <option value="nuova">Nuova</option><option value="approvata">Approvata</option><option value="scartata">Scartata</option>
                {form.status === "convertita" && <option value="convertita">Diventata script</option>}
              </NativeSelect>
            ) : <span />}
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="ghost" onClick={() => setForm(null)}><X className="mr-1 h-4 w-4" />Annulla</Button>
              <Button type="submit" size="sm" disabled={busy === "save"} className="bg-indigo-600 hover:bg-indigo-700" data-testid="idea-save">{busy === "save" && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Salva</Button>
            </div>
          </div>
        </form>
      )}
      {!ideas?.length ? (
        <p className="flex items-center gap-2 text-sm text-slate-500"><Lightbulb className="h-4 w-4" />Nessuna idea salvata. Annota qui spunti e trend da trasformare in video.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {ideas.map((i) => (
            <li key={i.id} className="py-3" data-testid="idea-row">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className={`font-semibold ${i.status === "scartata" ? "text-slate-400 line-through" : "text-slate-900"}`}>{i.title}</p>
                    <Chip className={STATUS_STYLE[i.status] || STATUS_STYLE.nuova}>{i.status_label}</Chip>
                  </div>
                  <p className="text-xs text-slate-500">{!clientId && `${i.client_name} · `}{fmtDate(i.created_at)}</p>
                  {i.note && <p className="mt-1 whitespace-pre-line text-sm text-slate-600">{i.note}</p>}
                  {i.reference_url && (
                    <a href={i.reference_url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex max-w-full items-center gap-1 truncate text-xs font-semibold text-indigo-600 hover:underline">
                      <ExternalLink className="h-3 w-3 shrink-0" /><span className="truncate">{i.reference_url}</span>
                    </a>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {isAdmin && i.status !== "convertita" && (
                    <Button size="sm" variant="outline" onClick={() => toScript(i)} disabled={busy === `s${i.id}`} data-testid="idea-to-script">
                      {busy === `s${i.id}` ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Wand2 className="mr-1 h-4 w-4" />}Crea script
                    </Button>
                  )}
                  {i.status === "convertita" && i.video_script_id && (
                    <Button size="sm" variant="ghost" onClick={() => navigate(`/script-idee?id=${i.video_script_id}`)}>Apri script</Button>
                  )}
                  {canEdit(i) && i.status === "nuova" && (
                    <Button size="sm" variant="ghost" className="text-emerald-700" onClick={() => quickStatus(i, "approvata")}>Approva</Button>
                  )}
                  {canEdit(i) && <Button size="icon" variant="ghost" onClick={() => setForm({ ...i })} title="Modifica"><Pencil className="h-4 w-4" /></Button>}
                  {canEdit(i) && (
                    <ConfirmDialog title="Eliminare l'idea?" onConfirm={() => remove(i)}
                      trigger={<Button size="icon" variant="ghost" className="text-rose-600" title="Elimina"><Trash2 className="h-4 w-4" /></Button>} />
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
