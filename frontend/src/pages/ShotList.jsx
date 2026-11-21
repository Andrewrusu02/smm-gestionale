import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Camera, Check, Clapperboard, FileText, Loader2, MapPin, Pencil, Plus, Trash2, Users, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, Field, Loading, NativeSelect, Panel } from "@/components/common";
import { useAuth } from "@/context/AuthContext";
import { api, errMsg, useApi } from "@/lib/api";
import { fmtDateTime } from "@/lib/constants";
import { cn } from "@/lib/utils";

const fmtDuration = (s) => {
  if (!s) return "";
  const m = Math.floor(s / 60);
  return m ? `${m}′${String(s % 60).padStart(2, "0")}″` : `${s}″`;
};

function CheckRow({ item, onToggle, busy }) {
  return (
    <button
      type="button"
      onClick={() => onToggle(item)}
      disabled={busy}
      className={cn("flex w-full items-start gap-3 rounded-xl border p-4 text-left transition-colors",
        item.done ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white hover:bg-slate-50")}
      data-testid={`shot-item-${item.id}`}
    >
      <span className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-2",
        item.done ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-300")}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : item.done && <Check className="h-4 w-4" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block font-semibold", item.done ? "text-slate-500 line-through" : "text-slate-900")}>{item.description}</span>
        {(item.framing || item.duration_seconds) && (
          <span className="mt-0.5 block text-sm text-slate-500">{[item.framing, fmtDuration(item.duration_seconds)].filter(Boolean).join(" · ")}</span>
        )}
        {item.done && item.done_by_name && <span className="mt-0.5 block text-xs text-emerald-700">Fatto da {item.done_by_name}</span>}
      </span>
    </button>
  );
}

function Editor({ data, scripts, onCancel, onSaved }) {
  const [form, setForm] = useState(() => ({
    location: data.location || "", people: data.people || "", video_script_id: data.video_script_id || "",
    scenes: data.scenes.map((s) => ({ ...s, framing: s.framing || "", duration_seconds: s.duration_seconds ?? "" })),
    equipment: data.equipment.map((s) => ({ ...s })),
  }));
  const [busy, setBusy] = useState(false);
  const update = (list, i, k, v) => setForm((f) => ({ ...f, [list]: f[list].map((x, j) => (j === i ? { ...x, [k]: v } : x)) }));
  const remove = (list, i) => setForm((f) => ({ ...f, [list]: f[list].filter((_, j) => j !== i) }));
  const add = (list) => setForm((f) => ({ ...f, [list]: [...f[list], { description: "", framing: "", duration_seconds: "" }] }));
  const move = (i, d) => setForm((f) => {
    const s = [...f.scenes];
    const j = i + d;
    if (j < 0 || j >= s.length) return f;
    [s[i], s[j]] = [s[j], s[i]];
    return { ...f, scenes: s };
  });
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    const items = [
      ...form.scenes.filter((s) => s.description.trim()).map((s) => ({
        id: s.id, kind: "scene", description: s.description, framing: s.framing || null,
        duration_seconds: s.duration_seconds === "" ? null : Number(s.duration_seconds),
      })),
      ...form.equipment.filter((s) => s.description.trim()).map((s) => ({ id: s.id, kind: "equipment", description: s.description })),
    ];
    try {
      const { data: saved } = await api.put(`/posts/${data.post.id}/shotlist`, {
        location: form.location || null, people: form.people || null,
        video_script_id: form.video_script_id ? Number(form.video_script_id) : null, items,
      });
      toast.success("Shot list salvata");
      onSaved(saved);
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={save} className="space-y-6">
      <Panel title="Dettagli della sessione">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Location"><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Es. Sala principale" data-testid="shot-location" /></Field>
          <Field label="Script video collegato">
            <NativeSelect value={form.video_script_id} onChange={(e) => setForm({ ...form, video_script_id: e.target.value })} data-testid="shot-script">
              <option value="">Nessuno</option>
              {(scripts || []).map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Persone" hint="Una per riga" className="sm:col-span-2"><Textarea rows={2} value={form.people} onChange={(e) => setForm({ ...form, people: e.target.value })} data-testid="shot-people" /></Field>
        </div>
      </Panel>
      <Panel title="Scene" action={<Button type="button" size="sm" variant="outline" onClick={() => add("scenes")} data-testid="shot-add-scene"><Plus className="mr-1 h-4 w-4" />Scena</Button>}>
        {!form.scenes.length && <p className="text-sm text-slate-500">Nessuna scena. Aggiungi la prima.</p>}
        <div className="space-y-3">
          {form.scenes.map((s, i) => (
            <div key={s.id || `n${i}`} className="grid grid-cols-12 gap-2 rounded-xl border border-slate-200 p-3">
              <span className="col-span-12 text-xs font-semibold text-slate-400 sm:col-span-1 sm:pt-2.5">#{i + 1}</span>
              <Input className="col-span-12 sm:col-span-5" placeholder="Descrizione della scena" value={s.description} onChange={(e) => update("scenes", i, "description", e.target.value)} data-testid="shot-scene-description" />
              <Input className="col-span-7 sm:col-span-3" placeholder="Inquadratura" value={s.framing} onChange={(e) => update("scenes", i, "framing", e.target.value)} />
              <Input className="col-span-5 sm:col-span-2" type="number" min="0" placeholder="Secondi" value={s.duration_seconds} onChange={(e) => update("scenes", i, "duration_seconds", e.target.value)} />
              <div className="col-span-12 flex justify-end gap-1 sm:col-span-1">
                <Button type="button" size="icon" variant="ghost" className="h-9 w-7" onClick={() => move(i, -1)} title="Sposta su">↑</Button>
                <Button type="button" size="icon" variant="ghost" className="h-9 w-7 text-rose-600" onClick={() => remove("scenes", i)} title="Rimuovi"><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="Attrezzatura" action={<Button type="button" size="sm" variant="outline" onClick={() => add("equipment")}><Plus className="mr-1 h-4 w-4" />Elemento</Button>}>
        <div className="space-y-2">
          {form.equipment.map((s, i) => (
            <div key={s.id || `e${i}`} className="flex gap-2">
              <Input placeholder="Es. Gimbal, microfono lavalier" value={s.description} onChange={(e) => update("equipment", i, "description", e.target.value)} />
              <Button type="button" size="icon" variant="ghost" className="text-rose-600" onClick={() => remove("equipment", i)}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
          {!form.equipment.length && <p className="text-sm text-slate-500">Nessuna attrezzatura in elenco.</p>}
        </div>
      </Panel>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}><X className="mr-2 h-4 w-4" />Annulla</Button>
        <Button type="submit" disabled={busy} className="bg-indigo-600 hover:bg-indigo-700" data-testid="shot-save">{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salva shot list</Button>
      </div>
    </form>
  );
}

export default function ShotList() {
  const { id } = useParams();
  const { user, isAdmin } = useAuth();
  const { data, loading, error, setData } = useApi(`/posts/${id}/shotlist`);
  const { data: scripts } = useApi(isAdmin && data ? `/scripts?client_id=${data.post.client_id}` : null);
  const [editing, setEditing] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [showScript, setShowScript] = useState(false);
  useEffect(() => { if (data && isAdmin && !data.scenes.length && !data.equipment.length) setEditing(true); }, [data, isAdmin]);

  if (loading && !data) return <Loading />;
  if (error || !data) return <EmptyState icon={Clapperboard} title="Shot list non disponibile" text={error} />;

  const toggle = async (item) => {
    setBusyId(item.id);
    try {
      const { data: upd } = await api.patch(`/shotlist-items/${item.id}`, { done: !item.done });
      setData((d) => {
        const patch = (list) => list.map((x) => (x.id === upd.id ? { ...x, ...upd, done_by_name: upd.done ? user.name : null } : x));
        const next = { ...d, scenes: patch(d.scenes), equipment: patch(d.equipment) };
        const all = [...next.scenes, ...next.equipment];
        return { ...next, progress: { ...d.progress, done: all.filter((x) => x.done).length } };
      });
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusyId(null);
    }
  };
  const pct = data.progress.total ? Math.round((data.progress.done / data.progress.total) * 100) : 0;

  return (
    <div className="mx-auto max-w-3xl" data-testid="shotlist-page">
      <Link to={`/calendario?date=${data.post.scheduled_at.slice(0, 10)}`} className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="h-4 w-4" />Calendario</Link>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600">Shot list · {data.post.client_name}</p>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">{data.post.title}</h1>
          <p className="mt-1 text-sm text-slate-500">{fmtDateTime(data.post.scheduled_at)} · {data.post.duration_minutes} min</p>
        </div>
        {isAdmin && !editing && <Button variant="outline" onClick={() => setEditing(true)} data-testid="shot-edit"><Pencil className="mr-2 h-4 w-4" />Modifica piano</Button>}
      </div>

      {editing ? (
        <Editor data={data} scripts={scripts} onCancel={() => setEditing(false)} onSaved={(saved) => { setData(saved); setEditing(false); }} />
      ) : (
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold text-slate-900">{data.progress.done} di {data.progress.total} fatti</span>
              <span className="font-num text-slate-500">{pct}%{data.progress.scene_seconds ? ` · girato previsto ${fmtDuration(data.progress.scene_seconds)}` : ""}</span>
            </div>
            <div className="mt-2 h-2 rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} /></div>
            <div className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <p className="flex items-start gap-2 text-slate-700"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />{data.location || "Location non indicata"}</p>
              <p className="flex items-start gap-2 whitespace-pre-line text-slate-700"><Users className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />{data.people || "Nessuna persona indicata"}</p>
            </div>
            {data.video_script && (
              <div className="mt-3 border-t border-slate-100 pt-3">
                <button type="button" onClick={() => setShowScript((v) => !v)} className="flex items-center gap-2 text-sm font-semibold text-indigo-600" data-testid="shot-script-toggle">
                  <FileText className="h-4 w-4" />{showScript ? "Nascondi script" : `Script: ${data.video_script.title}`}
                </button>
                {showScript && (
                  <div className="mt-2 whitespace-pre-line rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
                    {data.video_script.concept && <p className="mb-2 font-semibold">{data.video_script.concept}</p>}
                    {data.video_script.script_body || "Script vuoto."}
                  </div>
                )}
              </div>
            )}
          </div>
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-slate-900"><Clapperboard className="h-5 w-5 text-slate-400" />Scene</h2>
            {!data.scenes.length ? <p className="text-sm text-slate-500">Nessuna scena nel piano.</p> : (
              <div className="space-y-2">
                {data.scenes.map((s, i) => (
                  <div key={s.id} className="flex items-start gap-2">
                    <span className="w-6 pt-5 text-right font-num text-xs font-semibold text-slate-400">{i + 1}</span>
                    <div className="flex-1"><CheckRow item={s} onToggle={toggle} busy={busyId === s.id} /></div>
                  </div>
                ))}
              </div>
            )}
          </section>
          {data.equipment.length > 0 && (
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-slate-900"><Camera className="h-5 w-5 text-slate-400" />Attrezzatura</h2>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {data.equipment.map((s) => <CheckRow key={s.id} item={s} onToggle={toggle} busy={busyId === s.id} />)}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
