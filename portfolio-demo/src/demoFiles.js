// Portfolio demo: files the visitor uploads, kept in this browser (IndexedDB) so they still open after a
// reload. "Reset demo" deletes them. If the browser refuses (private mode), they last until the tab closes.
const DB = "cpp-demo-files", STORE = "files";
const open = () => new Promise((res, rej) => {
  const r = indexedDB.open(DB, 1);
  r.onupgradeneeded = () => r.result.createObjectStore(STORE);
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
});
let dbp = null;   // one connection for the page
const tx = async (mode, fn) => {
  const db = await (dbp ||= open());
  return new Promise((res, rej) => { const t = db.transaction(STORE, mode); const out = fn(t.objectStore(STORE)); t.oncomplete = () => res(out?.result ?? out); t.onerror = () => rej(t.error); });
};
/** { "<bucket>/<path>": Blob } for every file saved earlier. */
export async function loadFiles() {
  try {
    const db = await (dbp ||= open());
    return await new Promise((res) => {
      const out = {}, c = db.transaction(STORE).objectStore(STORE).openCursor();
      c.onsuccess = () => { const k = c.result; if (!k) return res(out); out[k.key] = k.value; k.continue(); };
      c.onerror = () => res(out);
    });
  } catch { return {}; }
}
export function saveFile(key, blob) { return tx("readwrite", (s) => (blob ? s.put(blob, key) : s.delete(key))).catch(() => null); }
export function clearFiles() { return new Promise((res) => { try { dbp?.then((d) => d.close()).catch(() => {}); dbp = null; const r = indexedDB.deleteDatabase(DB); r.onsuccess = r.onerror = r.onblocked = () => res(); } catch { res(); } }); }
