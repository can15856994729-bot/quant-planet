const KEY = "qp_read_signals";

export function getReadSet(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch { return new Set(); }
}

export function persistRead(id: string) {
  const set = getReadSet();
  set.add(id);
  try { localStorage.setItem(KEY, JSON.stringify([...set])); } catch {}
}

export function persistReadAll(ids: string[]) {
  const set = getReadSet();
  ids.forEach((id) => set.add(id));
  try { localStorage.setItem(KEY, JSON.stringify([...set])); } catch {}
}
