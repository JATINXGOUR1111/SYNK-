"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "./api";

/** Cursor-paginated infinite list with IntersectionObserver sentinel, loading + error states. */
export function useInfinite<T>(fetchPage: (cursor: string | null) => Promise<{ items: T[]; next: string | null }>, deps: unknown[]) {
  const [items, setItems] = useState<T[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const gen = useRef(0);
  const fetchRef = useRef(fetchPage);
  fetchRef.current = fetchPage;

  const load = useCallback(async (reset: boolean, cur: string | null) => {
    if (busy.current && !reset) return;
    busy.current = true;
    const g = reset ? ++gen.current : gen.current;
    setLoading(true); setError(null);
    try {
      const r = await fetchRef.current(reset ? null : cur);
      if (g !== gen.current) return;
      setItems((prev) => (reset ? r.items : [...prev, ...r.items.filter((n) => !prev.some((p) => (p as { id?: number }).id !== undefined && (p as { id?: number }).id === (n as { id?: number }).id))]));
      setCursor(r.next); setDone(!r.next);
    } catch (e) {
      if (g === gen.current) setError(e instanceof ApiError ? e.message : "Something went wrong.");
    } finally {
      if (g === gen.current) setLoading(false);
      busy.current = false;
    }
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { busy.current = false; setItems([]); setDone(false); load(true, null); }, deps);

  const sentinel = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((e) => { if (e[0].isIntersecting && !done && !loading && !error) load(false, cursor); }, { rootMargin: "600px" });
    io.observe(el);
    return () => io.disconnect();
  }, [done, loading, error, cursor, load]);

  return { items, setItems, loading, error, done, sentinel, retry: () => load(items.length === 0, cursor), reload: () => load(true, null) };
}

/** Simple one-shot fetch with loading/error. */
export function useFetch<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const run = useCallback(() => {
    setLoading(true); setError(null);
    fnRef.current().then(setData).catch((e) => setError(e instanceof ApiError ? e.message : "Something went wrong.")).finally(() => setLoading(false));
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { run(); }, deps);
  return { data, setData, loading, error, reload: run };
}
