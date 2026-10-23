import { format } from "date-fns";

export const CONTENT_TYPES = {
  reel: { label: "Reel", dot: "bg-rose-500", chip: "bg-rose-50 text-rose-700 border-rose-200" },
  storia: { label: "Storie", dot: "bg-orange-500", chip: "bg-orange-50 text-orange-700 border-orange-200" },
  carosello: { label: "Carosello", dot: "bg-sky-500", chip: "bg-sky-50 text-sky-700 border-sky-200" },
  grafica: { label: "Grafica", dot: "bg-violet-500", chip: "bg-violet-50 text-violet-700 border-violet-200" },
  post: { label: "Post", dot: "bg-teal-500", chip: "bg-teal-50 text-teal-700 border-teal-200" },
  sessione: { label: "Sessione registrazione", dot: "bg-amber-500", chip: "bg-amber-50 text-amber-800 border-amber-200" },
};

export const TASK_STATUSES = [
  { key: "da_fare", label: "Da fare", chip: "bg-slate-100 text-slate-700 border-slate-200", bar: "bg-slate-400" },
  { key: "in_corso", label: "In corso", chip: "bg-amber-100 text-amber-800 border-amber-200", bar: "bg-amber-500" },
  { key: "in_revisione", label: "In revisione", chip: "bg-purple-100 text-purple-800 border-purple-200", bar: "bg-purple-500" },
  { key: "completato", label: "Completato", chip: "bg-emerald-100 text-emerald-800 border-emerald-200", bar: "bg-emerald-500" },
];
export const TASK_STATUS_MAP = Object.fromEntries(TASK_STATUSES.map((s) => [s.key, s]));

export const PAYMENT_STATUS = {
  in_attesa: { label: "Da saldare", chip: "bg-slate-100 text-slate-700 border-slate-200" },
  saldato: { label: "Saldato", chip: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  in_ritardo: { label: "In ritardo", chip: "bg-rose-100 text-rose-800 border-rose-200" },
};

export const PACKAGE_STYLE = {
  standard: { label: "Standard", chip: "bg-emerald-50 text-emerald-700 border-emerald-200", bar: "bg-emerald-500", color: "#10B981" },
  silver: { label: "Silver", chip: "bg-blue-50 text-blue-700 border-blue-200", bar: "bg-blue-500", color: "#3B82F6" },
  premium: { label: "Premium", chip: "bg-purple-50 text-purple-700 border-purple-200", bar: "bg-purple-600", color: "#8B5CF6" },
  personalizzato: { label: "Personalizzato", chip: "bg-pink-50 text-pink-700 border-pink-200", bar: "bg-pink-500", color: "#EC4899" },
};

export const PROJECT_STATUS = {
  da_iniziare: "Da iniziare",
  in_corso: "In corso",
  in_revisione: "In revisione",
  completato: "Completato",
};

export const PRIORITY = {
  bassa: { label: "Bassa", chip: "bg-slate-50 text-slate-600 border-slate-200" },
  media: { label: "Media", chip: "bg-sky-50 text-sky-700 border-sky-200" },
  alta: { label: "Alta", chip: "bg-rose-50 text-rose-700 border-rose-200" },
};

export const CATEGORIES = {
  editoriale: { label: "Contenuti editoriali", chip: "bg-indigo-50 text-indigo-800 border-indigo-200", dot: "bg-indigo-500" },
  sessione: { label: "Sessioni di registrazione", chip: "bg-emerald-50 text-emerald-800 border-emerald-300", dot: "bg-emerald-500" },
  meeting: { label: "Appuntamenti commerciali", chip: "bg-amber-500 text-white border-amber-500", dot: "bg-amber-500" },
};
export const categoryOf = (contentType) => (contentType === "sessione" ? "sessione" : "editoriale");

export const MEETING_STYLE = { label: "Meeting", dot: "bg-white", chip: CATEGORIES.meeting.chip };

export const LEAD_STATUS = {
  nuovo: { label: "Nuovo", chip: "bg-slate-100 text-slate-700 border-slate-200" },
  appuntamento: { label: "Appuntamento fissato", chip: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  trattativa: { label: "In trattativa", chip: "bg-amber-50 text-amber-800 border-amber-200" },
  convertito: { label: "Convertito", chip: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  perso: { label: "Perso", chip: "bg-rose-50 text-rose-700 border-rose-200" },
};

const eurFmt = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
export const eur = (n) => eurFmt.format(n || 0);

export const parseDate = (d) => (d && d.length === 10 ? new Date(`${d}T00:00:00`) : new Date(d));
export const fmtDate = (d) => (d ? parseDate(d).toLocaleDateString("it-IT") : "—");
export const fmtTime = (d) => parseDate(d).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
export const fmtDateTime = (d) => (d ? `${fmtDate(d)} ${fmtTime(d)}` : "—");
export const todayISO = () => format(new Date(), "yyyy-MM-dd");
export const currentPeriod = () => format(new Date(), "yyyy-MM");

export const periodLabel = (p, long = false) => {
  const [y, m] = p.split("-");
  return new Date(+y, +m - 1, 1).toLocaleDateString("it-IT", long ? { month: "long", year: "numeric" } : { month: "short", year: "2-digit" });
};

export const shiftPeriod = (p, delta) => {
  const [y, m] = p.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return format(d, "yyyy-MM");
};

export const initials = (name = "") =>
  name.split(" ").filter(Boolean).slice(0, 2).map((s) => s[0].toUpperCase()).join("");
