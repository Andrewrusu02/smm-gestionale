// Il tema è salvato sul server (preferenze utente). In locale resta solo una copia dell'ultimo tema
// applicato, per disegnare subito la pagina col colore giusto (anche il login) senza il lampo chiaro.
export const THEME_CACHE_KEY = "smm_theme_last";
const LEGACY_THEME_KEY = "smm_theme";
const media = () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null);

let current = "light";
let listening = false;

const isDark = (theme) => theme === "dark" || (theme === "auto" && !!media()?.matches);

export function applyTheme(theme) {
  current = theme || "light";
  document.documentElement.classList.toggle("dark", isDark(current));
  try { localStorage.setItem(THEME_CACHE_KEY, current); } catch {}
  const mq = media();
  if (mq && !listening) {
    listening = true;
    mq.addEventListener?.("change", () => {
      if (current === "auto") document.documentElement.classList.toggle("dark", mq.matches);
    });
  }
}

export function applyCachedTheme() {
  try {
    applyTheme(localStorage.getItem(THEME_CACHE_KEY) || localStorage.getItem(LEGACY_THEME_KEY) || "light");
  } catch {}
}

export function legacyPreferences(user) {
  // Preferenze salvate dalle versioni precedenti solo nel browser.
  const out = {};
  try {
    const theme = localStorage.getItem(LEGACY_THEME_KEY);
    if (theme === "dark" || theme === "light") out.theme = theme;
    const avatar = [user?.id, user?.email, "current"].map((k) => localStorage.getItem(`smm_avatar_${k}`)).find(Boolean);
    if (avatar && avatar.startsWith("data:image/")) out.avatar = avatar;
  } catch {}
  return out;
}

export function clearLegacyPreferences(user) {
  try {
    localStorage.removeItem(LEGACY_THEME_KEY);
    [user?.id, user?.email, "current"].forEach((k) => localStorage.removeItem(`smm_avatar_${k}`));
  } catch {}
}
