import { useState } from "react";
import { ImagePlus, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/AuthContext";
import { errMsg } from "@/lib/api";

const HERO = "https://images.unsplash.com/photo-1756699276661-c81336d16c43?crop=entropy&cs=srgb&fm=jpg&q=80&w=1400";

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [cover, setCover] = useState(() => localStorage.getItem("smm_custom_cover") || HERO);
  const uploadCover = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { localStorage.setItem("smm_custom_cover", reader.result); setCover(reader.result); };
    reader.readAsDataURL(file);
  };

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden overflow-hidden bg-slate-950 lg:block">
        <img src={cover} alt="" className="absolute inset-0 h-full w-full object-cover opacity-40" />
        <div className="grain absolute inset-0" />
        <div className="relative flex h-full flex-col justify-between p-12 text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500 text-lg font-extrabold">S</div>
            <span className="font-bold">SMM Gestionale</span>
          </div>
          <div className="max-w-md">
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-indigo-300">Social Media Management</p>
            <h2 className="text-4xl font-extrabold leading-tight tracking-tight">Clienti, piano editoriale, team e incassi. In un unico posto.</h2>
            <p className="mt-4 text-sm text-slate-300">Pacchetti sotto controllo, task generati dal calendario e report finanziari sempre aggiornati.</p>
          </div>
          <label className="w-fit cursor-pointer rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold backdrop-blur hover:bg-white/20"><ImagePlus className="mr-2 inline h-4 w-4" />Personalizza copertina<input type="file" accept="image/*" className="hidden" onChange={uploadCover} /></label>
        </div>
      </div>
      <div className="flex items-center justify-center bg-slate-50 px-6 py-12">
        <form onSubmit={submit} className="w-full max-w-sm rise" data-testid="login-form">
          <div className="mb-8">
            <span className="mb-4 inline-flex rounded-xl bg-indigo-50 p-3 text-indigo-600"><Lock className="h-5 w-5" /></span>
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Accedi</h1>
            <p className="mt-2 text-sm text-slate-500">Inserisci le credenziali fornite dall'amministratore.</p>
          </div>
          <div className="space-y-4">
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Email</span>
              <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-11 bg-white" data-testid="login-email-input" autoComplete="email" />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Password</span>
              <Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="h-11 bg-white" data-testid="login-password-input" autoComplete="current-password" />
            </label>
            {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700" data-testid="login-error">{error}</p>}
            <Button type="submit" disabled={loading} className="h-11 w-full rounded-xl bg-indigo-600 font-semibold hover:bg-indigo-700" data-testid="login-submit-button">
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Entra
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
