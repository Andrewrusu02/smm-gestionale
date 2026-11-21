import { useState } from "react";
import { CalendarOff, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Chip, ConfirmDialog, Field, NativeSelect, Panel } from "@/components/common";
import { useAuth } from "@/context/AuthContext";
import { api, errMsg, qs, useApi } from "@/lib/api";
import { fmtDate, todayISO } from "@/lib/constants";

export const ABSENCE_KINDS = {
  ferie: { label: "Ferie", chip: "border-teal-200 bg-teal-50 text-teal-700" },
  permesso: { label: "Permesso", chip: "border-sky-200 bg-sky-50 text-sky-700" },
  indisponibile: { label: "Non disponibile", chip: "border-slate-200 bg-slate-100 text-slate-600" },
};

/** Ferie, permessi e indisponibilità: ognuno le proprie, l'amministratore anche quelle del team. */
export default function AbsencesPanel() {
  const { user, isAdmin } = useAuth();
  const { data: users } = useApi(isAdmin ? "/users/basic" : null);
  const [who, setWho] = useState(isAdmin ? "" : String(user.id));
  const { data: items, reload } = useApi(`/absences${qs({ user_id: who })}`);
  const empty = { user_id: String(user.id), kind: "ferie", start_date: todayISO(), end_date: todayISO(), note: "" };
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value, ...(k === "start_date" && f.end_date < e.target.value ? { end_date: e.target.value } : {}) }));
  const add = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/absences", { ...form, user_id: Number(form.user_id), note: form.note || null });
      toast.success("Assenza segnata: comparirà nel calendario");
      setForm(empty);
      reload();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  };
  const remove = async (a) => {
    try { await api.delete(`/absences/${a.id}`); toast.success("Assenza eliminata"); reload(); } catch (err) { toast.error(errMsg(err)); }
  };
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      <Panel title="Segna ferie, permessi o indisponibilità">
        <form onSubmit={add} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {isAdmin && (
            <Field label="Persona" className="sm:col-span-2">
              <NativeSelect value={form.user_id} onChange={set("user_id")} data-testid="absence-user">
                {(users || [user]).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </NativeSelect>
            </Field>
          )}
          <Field label="Tipo" className="sm:col-span-2">
            <NativeSelect value={form.kind} onChange={set("kind")} data-testid="absence-kind">
              {Object.entries(ABSENCE_KINDS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Dal"><Input type="date" required value={form.start_date} onChange={set("start_date")} data-testid="absence-start" /></Field>
          <Field label="Al (compreso)"><Input type="date" required min={form.start_date} value={form.end_date} onChange={set("end_date")} data-testid="absence-end" /></Field>
          <Field label="Nota" className="sm:col-span-2"><Input value={form.note} onChange={set("note")} placeholder="Facoltativa" /></Field>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={busy} className="bg-indigo-600 hover:bg-indigo-700" data-testid="absence-save">
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}Aggiungi
            </Button>
          </div>
        </form>
      </Panel>
      <Panel
        title={isAdmin ? "Assenze del team" : "Le mie assenze"}
        action={isAdmin && (
          <NativeSelect value={who} onChange={(e) => setWho(e.target.value)} className="h-9 w-44">
            <option value="">Tutto il team</option>
            {(users || []).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </NativeSelect>
        )}
      >
        {!items?.length ? (
          <p className="flex items-center gap-2 text-sm text-slate-500"><CalendarOff className="h-4 w-4" />Nessuna assenza in programma.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-2.5 text-sm" data-testid="absence-row">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Chip className={(ABSENCE_KINDS[a.kind] || ABSENCE_KINDS.indisponibile).chip}>{a.kind_label}</Chip>
                    {isAdmin && <span className="font-semibold text-slate-800">{a.user_name}</span>}
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {a.start_date === a.end_date ? fmtDate(a.start_date) : `dal ${fmtDate(a.start_date)} al ${fmtDate(a.end_date)}`}
                    {a.note && ` · ${a.note}`}
                  </p>
                </div>
                {(isAdmin || a.user_id === user.id) && (
                  <ConfirmDialog title="Eliminare l'assenza?" onConfirm={() => remove(a)}
                    trigger={<Button size="icon" variant="ghost" className="text-rose-600" title="Elimina"><Trash2 className="h-4 w-4" /></Button>} />
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
