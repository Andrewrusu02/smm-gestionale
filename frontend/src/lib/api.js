import axios from "axios";
import { useCallback, useEffect, useState } from "react";

export const TOKEN_KEY = "smm_token";

export const api = axios.create({ baseURL: `${process.env.REACT_APP_BACKEND_URL}/api` });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (e) => {
    if (e.response?.status === 401 && !e.config?.url?.includes("/auth/login")) {
      localStorage.removeItem(TOKEN_KEY);
      if (window.location.pathname !== "/login") window.location.href = "/login";
    }
    return Promise.reject(e);
  }
);

export function errMsg(e) {
  const d = e?.response?.data?.detail;
  if (d == null) return e?.message || "Si è verificato un errore. Riprova.";
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((x) => x?.msg || JSON.stringify(x)).join(" ");
  return d.message || d.msg || String(d);
}

export function useApi(path) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const load = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    try {
      const r = await api.get(path);
      setData(r.data);
      setError(null);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [path]);
  useEffect(() => {
    load();
  }, [load]);
  return { data, loading, error, reload: load, setData };
}

export function qs(params) {
  const s = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "" && v !== false) s.set(k, v);
  });
  const str = s.toString();
  return str ? `?${str}` : "";
}
