import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";

/** Applica un parametro dell'URL (es. ?q=…) allo stato della pagina, anche quando cambia restando sulla pagina. */
export function useUrlParam(key, apply) {
  const [params] = useSearchParams();
  const value = params.get(key);
  const applyRef = useRef(apply);
  applyRef.current = apply;
  useEffect(() => {
    if (value !== null) applyRef.current(value);
  }, [value]);
  return value;
}
