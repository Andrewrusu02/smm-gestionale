import { useState } from "react";
import { Check, Copy, Hash, Plus, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/common";
import { api, errMsg, useApi } from "@/lib/api";

export function CopyButton({ text, label = "Copia", testId }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text || "");
      setDone(true);
      toast.success("Copiato negli appunti");
      setTimeout(() => setDone(false), 1500);
    } catch {
      toast.error("Copia non riuscita");
    }
  };
  return (
    <Button type="button" size="sm" variant="outline" onClick={copy} disabled={!text} className="h-8" data-testid={testId}>
      {done ? <Check className="mr-1 h-3.5 w-3.5" /> : <Copy className="mr-1 h-3.5 w-3.5" />}{label}
    </Button>
  );
}

const mergeTags = (current, extra) => {
  const seen = new Set();
  return `${current || ""} ${extra || ""}`.split(/[\s,;]+/).filter(Boolean)
    .map((t) => (t.startsWith("#") ? t : `#${t}`))
    .filter((t) => { const k = t.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
    .join(" ");
};

/** Caption e hashtag del contenuto, con copia e set di hashtag ricorrenti del cliente. */
export default function CaptionFields({ clientId, caption, hashtags, onChange }) {
  const { data: sets, reload } = useApi(clientId ? `/clients/${clientId}/hashtag-sets` : null);
  const [saveName, setSaveName] = useState(null);
  const saveSet = async () => {
    try {
      await api.post(`/clients/${clientId}/hashtag-sets`, { name: saveName, hashtags });
      toast.success("Set di hashtag salvato per il cliente");
      setSaveName(null);
      reload();
    } catch (err) {
      toast.error(errMsg(err));
    }
  };
  return (
    <div className="space-y-3 rounded-xl border border-slate-200 p-3" data-testid="caption-fields">
      <Field label="Caption">
        <Textarea rows={4} value={caption || ""} onChange={(e) => onChange({ caption: e.target.value })} placeholder="Testo del post" data-testid="post-caption-input" />
      </Field>
      <div className="flex justify-end"><CopyButton text={caption} label="Copia caption" testId="copy-caption" /></div>
      <Field label="Hashtag">
        <Textarea rows={2} value={hashtags || ""} onChange={(e) => onChange({ hashtags: e.target.value })} placeholder="#brand #città #tema" data-testid="post-hashtags-input" />
      </Field>
      <div className="flex flex-wrap items-center gap-2">
        {(sets || []).map((s) => (
          <Button key={s.id} type="button" size="sm" variant="outline" className="h-8" title={s.hashtags}
            onClick={() => onChange({ hashtags: mergeTags(hashtags, s.hashtags) })} data-testid="hashtag-set-add">
            <Plus className="mr-1 h-3.5 w-3.5" />{s.name}
          </Button>
        ))}
        <span className="flex-1" />
        {clientId && hashtags?.trim() && saveName === null && (
          <Button type="button" size="sm" variant="ghost" className="h-8" onClick={() => setSaveName("")} data-testid="hashtag-set-save-open">
            <Save className="mr-1 h-3.5 w-3.5" />Salva come set
          </Button>
        )}
        <CopyButton text={hashtags} label="Copia hashtag" testId="copy-hashtags" />
        <CopyButton text={[caption, hashtags].filter(Boolean).join("\n\n")} label="Copia tutto" testId="copy-all" />
      </div>
      {saveName !== null && (
        <div className="flex gap-2">
          <Input autoFocus value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="Nome del set (es. Hashtag base)" className="h-9" />
          <Button type="button" size="sm" disabled={!saveName.trim()} onClick={saveSet} className="h-9 bg-indigo-600 hover:bg-indigo-700"><Hash className="mr-1 h-3.5 w-3.5" />Salva</Button>
          <Button type="button" size="sm" variant="ghost" className="h-9" onClick={() => setSaveName(null)}>Annulla</Button>
        </div>
      )}
    </div>
  );
}

/** Versione in sola lettura (dipendenti): testo e pulsanti Copia. */
export function CaptionView({ caption, hashtags }) {
  if (!caption && !hashtags) return null;
  return (
    <div className="space-y-2 rounded-xl border border-slate-200 p-3">
      {caption && <p className="whitespace-pre-line text-sm text-slate-700">{caption}</p>}
      {hashtags && <p className="text-sm font-medium text-indigo-700">{hashtags}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        {caption && <CopyButton text={caption} label="Copia caption" />}
        {hashtags && <CopyButton text={hashtags} label="Copia hashtag" />}
        <CopyButton text={[caption, hashtags].filter(Boolean).join("\n\n")} label="Copia tutto" />
      </div>
    </div>
  );
}
