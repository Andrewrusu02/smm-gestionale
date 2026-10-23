import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Loader2, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Chip, ConfirmDialog, Field, NativeSelect } from "@/components/common";
import { api, errMsg, qs } from "@/lib/api";
import { CONTENT_TYPES, fmtDateTime, TASK_STATUS_MAP } from "@/lib/constants";

const TASK_PREFIX = {
  reel: "Montaggio Reel", storia: "Creazione Storie", carosello: "Creazione Carosello",
  grafica: "Creazione Grafica", post: "Preparazione Post", sessione: "Sessione di registrazione",
};

function PostView({ post }) {
  return (
    <div className="space-y-3 text-sm" data-testid="post-detail-view">
      <Chip className={CONTENT_TYPES[post.content_type].chip}>{CONTENT_TYPES[post.content_type].label}</Chip>
      <p className="text-lg font-bold">{post.title}</p>
      <p className="text-slate-500">{post.client_name} · {fmtDateTime(post.scheduled_at)} · {post.duration_minutes} min</p>
      {post.description && <p className="whitespace-pre-line rounded-lg bg-slate-50 p-3">{post.description}</p>}
      {post.task_status && <p className="text-xs text-slate-500">Task: <b>{TASK_STATUS_MAP[post.task_status].label}</b> · {post.assignee_name || "non assegnato"}</p>}
    </div>
  );
}

export default function PostFormDialog({ open, onOpenChange, post, defaultDate, clients, isAdmin, onSaved }) {
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(post
      ? { ...post, scheduled_at: post.scheduled_at.slice(0, 16), description: post.description || "" }
      : { client_id: clients[0]?.id || "", title: "", content_type: "reel", duration_minutes: 60, description: "",
          scheduled_at: `${format(defaultDate || new Date(), "yyyy-MM-dd")}T10:00` });
  }, [open, post, defaultDate, clients]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const clientName = clients.find((c) => String(c.id) === String(form.client_id))?.name || "Cliente";
  const [credits, setCredits] = useState(null);

  useEffect(() => {
    if (!open || !isAdmin || !form.client_id || !form.content_type) return setCredits(null);
    api.get(`/clients/${form.client_id}/credits${qs({ content_type: form.content_type, exclude_post_id: post?.id })}`)
      .then((r) => setCredits(r.data)).catch(() => setCredits(null));
  }, [open, isAdmin, form.client_id, form.content_type, post]);

  const send = async (force = false) => {
    setSaving(true);
    const body = { client_id: Number(form.client_id), title: form.title, content_type: form.content_type,
      scheduled_at: form.scheduled_at, duration_minutes: Number(form.duration_minutes) || 60, description: form.description || null };
    const q = force ? "?force=true" : "";
    try {
      if (post) await api.put(`/posts/${post.id}${q}`, body);
      else await api.post(`/posts${q}`, body);
      toast.success(post ? "Contenuto aggiornato" : force ? "Contenuto inserito oltre i crediti del pacchetto" : "Contenuto programmato e task creato");
      onSaved();
      onOpenChange(false);
    } catch (err) {
      if (err.response?.status === 409 && err.response.data?.detail?.code === "credits_exhausted") {
        toast.warning(err.response.data.detail.message, {
          description: `Crediti usati: ${err.response.data.detail.used}/${err.response.data.detail.limit}`,
          duration: 12000,
          action: { label: "Inserisci comunque", onClick: () => send(true) },
        });
      } else toast.error(errMsg(err));
    } finally {
      setSaving(false);
    }
  };

  const submit = (e) => {
    e.preventDefault();
    send(false);
  };

  const remove = async () => {
    try {
      await api.delete(`/posts/${post.id}`);
      toast.success("Contenuto eliminato");
      onSaved();
      onOpenChange(false);
    } catch (err) {
      toast.error(errMsg(err));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="mx-4 max-h-[90vh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto p-4 sm:p-6" data-testid="post-form-dialog">
        <DialogHeader><DialogTitle>{!isAdmin ? "Dettaglio contenuto" : post ? "Modifica contenuto" : "Programma contenuto"}</DialogTitle></DialogHeader>
        {!isAdmin ? (post && <PostView post={post} />) : (
          <form onSubmit={submit} className="space-y-4">
            {clients.length === 0 && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Crea prima un cliente per programmare contenuti.</p>}
            <div className="grid grid-cols-2 gap-4">
              <Field label="Cliente *">
                <NativeSelect required value={form.client_id} onChange={set("client_id")} data-testid="post-client-select">
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </NativeSelect>
              </Field>
              <Field label="Tipologia *">
                <NativeSelect value={form.content_type} onChange={set("content_type")} data-testid="post-type-select">
                  {Object.entries(CONTENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </NativeSelect>
              </Field>
            </div>
            <Field label="Titolo *"><Input required value={form.title || ""} onChange={set("title")} placeholder="es. Reel nuovo menù autunnale" data-testid="post-title-input" /></Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Data e ora *"><Input type="datetime-local" required value={form.scheduled_at || ""} onChange={set("scheduled_at")} data-testid="post-datetime-input" /></Field>
              <Field label="Durata (min)"><Input type="number" min={5} value={form.duration_minutes || 60} onChange={set("duration_minutes")} data-testid="post-duration-input" /></Field>
            </div>
            <Field label="Note / brief"><Textarea value={form.description || ""} onChange={set("description")} data-testid="post-description-input" /></Field>
            {credits?.tracked && (
              <p data-testid="post-credits-info" className={`rounded-lg px-3 py-2 text-xs font-semibold ${credits.remaining > 0 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                Crediti {CONTENT_TYPES[form.content_type].label}: {Math.max(credits.remaining, 0)}/{credits.limit} rimanenti
                {credits.remaining <= 0 && " — crediti esauriti per questo contenuto"}
              </p>
            )}
            {!post && form.content_type && (
              <p className="flex items-center gap-2 rounded-lg bg-indigo-50 px-3 py-2 text-xs text-indigo-700" data-testid="auto-task-preview">
                <Wand2 className="h-4 w-4" />Verrà creato il task "{TASK_PREFIX[form.content_type]} - {clientName}"
              </p>
            )}
            {post?.google_event_id && <p className="text-xs text-emerald-600">Sincronizzato con Google Calendar</p>}
            <DialogFooter className="gap-2 sm:justify-between">
              {post ? (
                <ConfirmDialog testId="delete-post" title="Eliminare il contenuto?" description="Verrà rimosso anche il task collegato (se non completato) e l'evento su Google Calendar." onConfirm={remove}
                  trigger={<Button type="button" variant="ghost" className="text-rose-600" data-testid="delete-post-button"><Trash2 className="mr-2 h-4 w-4" />Elimina</Button>} />
              ) : <span />}
              <Button type="submit" disabled={saving || !clients.length} className="bg-indigo-600 hover:bg-indigo-700" data-testid="post-form-submit">
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{post ? "Salva" : "Programma"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
