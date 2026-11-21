import axios from "axios";
import { useCallback, useEffect, useRef, useState } from "react";

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
  const lastRequest = useRef(0);
  const load = useCallback(async () => {
    if (!path) return;
    // Se cambi filtro/periodo velocemente, solo l'ultima richiesta aggiorna la pagina.
    const requestId = ++lastRequest.current;
    setLoading(true);
    try {
      const r = await api.get(path);
      if (requestId !== lastRequest.current) return;
      setData(r.data);
      setError(null);
    } catch (e) {
      if (requestId !== lastRequest.current) return;
      setError(errMsg(e));
    } finally {
      if (requestId === lastRequest.current) setLoading(false);
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

/** Scarica un file da un endpoint autenticato (il token va nell'header, quindi niente link diretto). */
export async function downloadFile(path, filename, params) {
  const r = await api.get(path, { responseType: "blob", params });
  const disposition = r.headers?.["content-disposition"] || "";
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
  const url = URL.createObjectURL(r.data);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || (match ? decodeURIComponent(match[1]) : "download");
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
