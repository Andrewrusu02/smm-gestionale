import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, TOKEN_KEY } from "@/lib/api";
import { applyTheme, clearLegacyPreferences, legacyPreferences } from "@/lib/theme";

export const HOME_REDIRECT_KEY = "smm_home_redirected";

// Al primo accesso con la nuova versione porta sul server tema e foto salvati nel browser.
async function migrateLegacyPreferences(user) {
  if (!user || user.preferences_migrated) return user;
  const legacy = legacyPreferences(user);
  let updated = user;
  try {
    if (legacy.avatar && !user.avatar_url) {
      updated = (await api.post("/auth/me/avatar", { data_url: legacy.avatar })).data;
    }
  } catch {
    // Una foto vecchia non valida non deve bloccare l'accesso.
  }
  try {
    const prefs = { preferences_migrated: true };
    if (legacy.theme && !user.theme) prefs.theme = legacy.theme;
    updated = (await api.put("/auth/me/preferences", prefs)).data;
    clearLegacyPreferences(user);
  } catch {}
  return updated;
}

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUserState] = useState(null);

  const setUser = useCallback((next) => {
    setUserState(next);
    // Senza un tema scelto sul server resta quello già applicato (l'ultimo usato in questo browser).
    if (next?.theme) applyTheme(next.theme);
  }, []);

  const accept = useCallback(async (data) => {
    setUser(data);
    const migrated = await migrateLegacyPreferences(data);
    if (migrated !== data) setUser(migrated);
    return migrated;
  }, [setUser]);

  const refresh = useCallback(async () => {
    if (!localStorage.getItem(TOKEN_KEY)) return setUser(false);
    try {
      const { data } = await api.get("/auth/me");
      await accept(data);
    } catch {
      setUser(false);
    }
  }, [accept, setUser]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    localStorage.setItem(TOKEN_KEY, data.token);
    try { sessionStorage.removeItem(HOME_REDIRECT_KEY); } catch {}
    return accept(data.user);
  };

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    try { sessionStorage.removeItem(HOME_REDIRECT_KEY); } catch {}
    setUser(false);
  };

  return (
    <AuthContext.Provider value={{ user, setUser, login, logout, refresh, isAdmin: user?.role === "admin" }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
