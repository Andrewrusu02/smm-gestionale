import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CheckCircle2, Copy, Database, Download, Link2, Loader2, Monitor, Moon, RefreshCw, Sun, Trash2, Unplug, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Chip, EmptyState, Field, Loading, NativeSelect, PageHeader, Panel, UserAvatar } from "@/components/common";
import { ADMIN_NAV, EMPLOYEE_NAV } from "@/components/AppShell";
import { useAuth } from "@/context/AuthContext";
import { api, downloadFile, errMsg, useApi } from "@/lib/api";
import { fmtBytes, fmtDateTime } from "@/lib/constants";

const THEMES = [
  { key: "light", label: "Chiaro", icon: Sun },
  { key: "dark", label: "Scuro", icon: Moon },
  { key: "auto", label: "Automatico", icon: Monitor },
];

function ProfileTab() {
  const { user, setUser, isAdmin } = useAuth();
  const [form, setForm] = useState({ name: user.name, phone: user.phone || "" });
  const [busy, setBusy] = useState("");
  const theme = user.theme || "light";
  const homeOptions = (isAdmin ? ADMIN_NAV : EMPLOYEE_NAV).filter((n) => n.to !== "/impostazioni");
  const save = async (e) => {
    e.preventDefault();
    setBusy("profile");
    try {
      const { data } = await api.put("/auth/me", form);
      setUser(data);
      toast.success("Profilo aggiornato");
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy("");
    }
  };
  const savePrefs = async (prefs, message) => {
    setBusy("prefs");
    try {
      const { data } = await api.put("/auth/me/preferences", prefs);
      setUser(data);
      toast.success(message);
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy("");
    }
  };
  const uploadAvatar = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("Seleziona un'immagine valida");
    if (file.size > 8 * 1024 * 1024) return toast.error("Immagine troppo grande (massimo 8 MB)");
    const reader = new FileReader();
    reader.onload = async () => {
      setBusy("avatar");
      try {
        const { data } = await api.post("/auth/me/avatar", { data_url: String(reader.result) });
        setUser(data);
        toast.success("Foto profilo aggiornata");
      } catch (err) {
        toast.error(errMsg(err));
      } finally {
        setBusy("");
      }
    };
    reader.onerror = () => toast.error("Impossibile leggere l'immagine");
    reader.readAsDataURL(file);
  };
  const removeAvatar = async () => {
    setBusy("avatar");
    try {
      const { data } = await api.delete("/auth/me/avatar");
      setUser(data);
      toast.success("Foto profilo rimossa");
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy("");
    }
  };
  return (
    <div className="space-y-6">
    <Panel title="Profilo" className="max-w-xl">
      <div className="mb-5 flex flex-wrap items-center gap-4">
        <UserAvatar name={user.name} url={user.avatar_url} size="lg" testId="profile-avatar" />
        <label className="inline-flex cursor-pointer items-center rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50">
          {busy === "avatar" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}Carica foto
          <input type="file" accept="image/*" className="hidden" onChange={uploadAvatar} disabled={busy === "avatar"} data-testid="profile-avatar-input" />
        </label>
        {user.avatar_url && (
          <Button type="button" variant="ghost" className="text-rose-600" onClick={removeAvatar} disabled={busy === "avatar"} data-testid="profile-avatar-remove">
            <Trash2 className="mr-2 h-4 w-4" />Rimuovi
          </Button>
        )}
      </div>
      <form onSubmit={save} className="space-y-4">
        <Field label="Email"><Input value={user.email} disabled data-testid="profile-email-input" /></Field>
        <Field label="Nome"><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="profile-name-input" /></Field>
        <Field label="Telefono"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} data-testid="profile-phone-input" /></Field>
        <Button type="submit" disabled={busy === "profile"} className="bg-indigo-600 hover:bg-indigo-700" data-testid="profile-save-button">{busy === "profile" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salva</Button>
      </form>
    </Panel>
    <Panel title="Preferenze" className="max-w-xl">
      <p className="mb-4 text-sm text-slate-500">Le preferenze sono salvate nel tuo account e ti seguono su qualsiasi dispositivo.</p>
      <div className="space-y-5">
        <div>
          <p className="mb-2 font-semibold">Tema interfaccia</p>
          <div className="grid grid-cols-3 gap-2" data-testid="theme-options">
            {THEMES.map(({ key, label, icon: Icon }) => (
              <Button key={key} type="button" variant="outline" disabled={busy === "prefs"}
                onClick={() => key !== theme && savePrefs({ theme: key }, "Tema aggiornato")}
                className={theme === key ? "border-indigo-500 bg-indigo-50 text-indigo-700" : ""}
                data-testid={`theme-${key}`}>
                <Icon className="mr-2 h-4 w-4" />{label}
              </Button>
            ))}
          </div>
          {theme === "auto" && <p className="mt-2 text-xs text-slate-500">Segue l'impostazione chiaro/scuro del dispositivo.</p>}
        </div>
        <Field label="Pagina iniziale" hint="La pagina che si apre dopo l'accesso.">
          <NativeSelect value={user.home_page || "/"} disabled={busy === "prefs"}
            onChange={(e) => savePrefs({ home_page: e.target.value }, "Pagina iniziale aggiornata")} data-testid="home-page-select">
            {homeOptions.map((n) => <option key={n.to} value={n.to}>{n.label}</option>)}
          </NativeSelect>
        </Field>
      </div>
    </Panel>
    </div>
  );
}

function PasswordTab() {
  const [form, setForm] = useState({ current_password: "", new_password: "", confirm: "" });
  const [busy, setBusy] = useState(false);
  const save = async (e) => {
    e.preventDefault();
    if (form.new_password !== form.confirm) return toast.error("Le nuove password non coincidono");
    setBusy(true);
    try {
      await api.post("/auth/change-password", { current_password: form.current_password, new_password: form.new_password });
      toast.success("Password aggiornata");
      setForm({ current_password: "", new_password: "", confirm: "" });
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  };
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  return (
    <Panel title="Cambia password" className="max-w-xl">
      <form onSubmit={save} className="space-y-4">
        <Field label="Password attuale"><Input type="password" required value={form.current_password} onChange={set("current_password")} data-testid="current-password-input" /></Field>
        <Field label="Nuova password" hint="Minimo 8 caratteri"><Input type="password" required minLength={8} value={form.new_password} onChange={set("new_password")} data-testid="new-password-input" /></Field>
        <Field label="Conferma nuova password"><Input type="password" required minLength={8} value={form.confirm} onChange={set("confirm")} data-testid="confirm-password-input" /></Field>
        <Button type="submit" disabled={busy} className="bg-indigo-600 hover:bg-indigo-700" data-testid="change-password-button">{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Aggiorna password</Button>
      </form>
    </Panel>
  );
}

function GoogleTab() {
  const { data, reload, setData } = useApi("/integrations/google");
  const [form, setForm] = useState({ client_id: "", client_secret: "", calendar_id: "primary" });
  const [busy, setBusy] = useState("");
  useEffect(() => { if (data) setForm((f) => ({ ...f, client_id: data.client_id, calendar_id: data.calendar_id })); }, [data]);
  if (!data) return null;

  const run = async (key, fn) => {
    setBusy(key);
    try { await fn(); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(""); }
  };
  const saveKeys = (e) => {
    e.preventDefault();
    run("save", async () => {
      const r = await api.put("/integrations/google", form);
      setData(r.data);
      setForm((f) => ({ ...f, client_secret: "" }));
      toast.success("Credenziali salvate");
    });
  };
  const connect = () => run("connect", async () => { window.location.href = (await api.get("/integrations/google/auth-url")).data.url; });
  const disconnect = () => run("disc", async () => { setData((await api.post("/integrations/google/disconnect")).data); toast.success("Account Google scollegato"); });
  const sync = () => run("sync", async () => {
    const r = await api.post("/integrations/google/sync");
    toast.success(`Sincronizzati: ${r.data.pushed} inviati, ${r.data.pulled} aggiornati da Google`);
    reload();
  });

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      <Panel title="Credenziali Google Cloud (OAuth 2.0)" testId="google-credentials-panel">
        <form onSubmit={saveKeys} className="space-y-4">
          <Field label="Client ID"><Input required value={form.client_id} onChange={(e) => setForm({ ...form, client_id: e.target.value })} data-testid="google-client-id-input" /></Field>
          <Field label="Client Secret" hint={data.has_secret ? "Già salvato (cifrato). Inserisci un nuovo valore solo per sostituirlo." : "Verrà salvato cifrato nel database"}>
            <Input type="password" required={!data.has_secret} value={form.client_secret} onChange={(e) => setForm({ ...form, client_secret: e.target.value })} data-testid="google-client-secret-input" />
          </Field>
          <Field label="ID calendario" hint="Usa 'primary' per il calendario principale o l'ID di un calendario dedicato">
            <Input value={form.calendar_id} onChange={(e) => setForm({ ...form, calendar_id: e.target.value })} data-testid="google-calendar-id-input" />
          </Field>
          <Field label="URI di reindirizzamento autorizzato" hint="Copialo nella console Google Cloud → Credenziali → Client OAuth">
            <div className="flex gap-2">
              <Input readOnly value={data.redirect_uri} className="font-num text-xs" data-testid="google-redirect-uri" />
              <Button type="button" variant="outline" size="icon" onClick={() => { navigator.clipboard.writeText(data.redirect_uri); toast.success("Copiato"); }} data-testid="copy-redirect-uri"><Copy className="h-4 w-4" /></Button>
            </div>
          </Field>
          <Button type="submit" disabled={busy === "save"} className="bg-indigo-600 hover:bg-indigo-700" data-testid="google-save-button">{busy === "save" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salva credenziali</Button>
        </form>
      </Panel>
      <Panel title="Collegamento Google Calendar" testId="google-connection-panel">
        <div className="space-y-4 text-sm">
          <div className="flex items-center gap-3">
            {data.connected
              ? <Chip className="border-emerald-200 bg-emerald-50 text-emerald-700" testId="google-status-badge"><CheckCircle2 className="h-3 w-3" />Collegato</Chip>
              : <Chip className="border-slate-200 bg-slate-50 text-slate-600" testId="google-status-badge">Non collegato</Chip>}
            {data.email && <span className="text-slate-600" data-testid="google-account-email">{data.email}</span>}
          </div>
          <ul className="space-y-1.5 text-slate-600">
            <li>• App → Google: creazione, modifica ed eliminazione dei contenuti del piano editoriale vengono replicate subito.</li>
            <li>• Google → App: ogni {Math.round(data.sync_interval_seconds / 60)} minuti il server rileva spostamenti di data/ora o eliminazioni fatti da Google Calendar.</li>
            <li>• Il refresh token è salvato cifrato nel database per mantenere la connessione attiva.</li>
          </ul>
          {data.last_sync && <p className="text-xs text-slate-500">Ultima sincronizzazione: {fmtDateTime(data.last_sync)} (UTC)</p>}
          {data.last_error && <p className="rounded-lg bg-rose-50 p-3 text-xs text-rose-700" data-testid="google-last-error">{data.last_error}</p>}
          <div className="flex flex-wrap gap-2 pt-2">
            {!data.connected ? (
              <Button onClick={connect} disabled={!data.client_id || !data.has_secret || busy === "connect"} className="bg-slate-900 hover:bg-slate-800" data-testid="google-connect-button">
                {busy === "connect" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Link2 className="mr-2 h-4 w-4" />}Collega account Google
              </Button>
            ) : <>
              <Button onClick={sync} disabled={busy === "sync"} variant="outline" data-testid="google-sync-now-button"><RefreshCw className={`mr-2 h-4 w-4 ${busy === "sync" ? "animate-spin" : ""}`} />Sincronizza ora</Button>
              <Button onClick={disconnect} disabled={busy === "disc"} variant="ghost" className="text-rose-600" data-testid="google-disconnect-button"><Unplug className="mr-2 h-4 w-4" />Scollega</Button>
            </>}
          </div>
          {(!data.client_id || !data.has_secret) && <p className="text-xs text-slate-500">Salva prima Client ID e Client Secret per attivare il collegamento.</p>}
        </div>
      </Panel>
    </div>
  );
}

const BACKUP_KIND = {
  auto: { label: "Automatico", chip: "border-indigo-200 bg-indigo-50 text-indigo-700" },
  manuale: { label: "Manuale", chip: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  "pre-migrazione": { label: "Prima di una migrazione", chip: "border-amber-200 bg-amber-50 text-amber-800" },
  altro: { label: "Altro", chip: "border-slate-200 bg-slate-50 text-slate-600" },
};

function BackupTab() {
  const { data, loading, reload } = useApi("/backups");
  const [busy, setBusy] = useState("");
  const backupNow = async () => {
    setBusy("now");
    try {
      const { data: b } = await api.post("/backups");
      toast.success(`Backup creato: ${b.name}`);
      reload();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy("");
    }
  };
  const download = async (name) => {
    setBusy(name);
    try { await downloadFile(`/backups/${encodeURIComponent(name)}/download`, name); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(""); }
  };
  return (
    <Panel
      title="Backup del database"
      testId="backup-panel"
      action={<Button onClick={backupNow} disabled={busy === "now"} className="bg-indigo-600 hover:bg-indigo-700" data-testid="backup-now-button">
        {busy === "now" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Database className="mr-2 h-4 w-4" />}Backup ora
      </Button>}
    >
      <p className="mb-4 text-sm text-slate-500">
        Ogni notte viene creato un backup automatico. Si conservano gli ultimi {data?.retention_days || 30} giorni; i più vecchi vengono cancellati.
        Prima di ogni aggiornamento del database viene fatto un backup in più.
      </p>
      {loading && !data ? <Loading /> : !data?.items?.length ? (
        <EmptyState icon={Database} title="Nessun backup" text="Crea il primo backup con il pulsante qui sopra." />
      ) : (
        <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
          {data.items.map((b) => (
            <div key={b.name} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3" data-testid="backup-row">
              <div className="min-w-0">
                <p className="truncate font-num text-sm font-semibold text-slate-900">{b.name}</p>
                <p className="text-xs text-slate-500">{fmtDateTime(b.created_at)} · {fmtBytes(b.size)}</p>
              </div>
              <div className="flex items-center gap-2">
                <Chip className={(BACKUP_KIND[b.kind] || BACKUP_KIND.altro).chip}>{(BACKUP_KIND[b.kind] || BACKUP_KIND.altro).label}</Chip>
                <Button variant="outline" size="sm" onClick={() => download(b.name)} disabled={busy === b.name} data-testid="backup-download-button">
                  {busy === b.name ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}Scarica
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

export default function Settings() {
  const { isAdmin } = useAuth();
  const [params] = useSearchParams();
  const [tab, setTab] = useState(params.get("tab") || "profilo");
  useEffect(() => {
    const g = params.get("google");
    if (g === "connected") toast.success("Google Calendar collegato con successo");
    if (g === "error") toast.error(`Collegamento Google non riuscito: ${params.get("msg") || "errore"}`);
  }, [params]);
  return (
    <div data-testid="settings-page">
      <PageHeader eyebrow="Account" title="Impostazioni" subtitle="Profilo, sicurezza, integrazioni e backup." />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="profilo" data-testid="settings-tab-profilo">Profilo</TabsTrigger>
          <TabsTrigger value="sicurezza" data-testid="settings-tab-sicurezza">Sicurezza</TabsTrigger>
          {isAdmin && <TabsTrigger value="integrazioni" data-testid="settings-tab-integrazioni">Integrazioni</TabsTrigger>}
          {isAdmin && <TabsTrigger value="backup" data-testid="settings-tab-backup">Backup</TabsTrigger>}
        </TabsList>
        <TabsContent value="profilo"><ProfileTab /></TabsContent>
        <TabsContent value="sicurezza"><PasswordTab /></TabsContent>
        {isAdmin && <TabsContent value="integrazioni"><GoogleTab /></TabsContent>}
        {isAdmin && <TabsContent value="backup"><BackupTab /></TabsContent>}
      </Tabs>
    </div>
  );
}
