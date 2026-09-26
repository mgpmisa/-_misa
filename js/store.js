// 大きな世界を保存するための IndexedDB（使えなければ localStorage）
const DB = 'elderland', STORE = 'save', KEY = 'world-v2';

function open() {
  return new Promise((res, rej) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    } catch (e) { rej(e); }
  });
}

export async function saveWorld(data) {
  try {
    const db = await open();
    await new Promise((res, rej) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(data, KEY);
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
    db.close();
    return true;
  } catch (e) {
    try { localStorage.setItem(KEY, JSON.stringify(data)); return true; } catch (e2) { return false; }
  }
}

export async function loadWorld() {
  try {
    const db = await open();
    const data = await new Promise((res, rej) => {
      const tx = db.transaction(STORE, 'readonly');
      const r = tx.objectStore(STORE).get(KEY);
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    db.close();
    if (data) return data;
  } catch (e) { /* IndexedDB が使えない環境 */ }
  try { const raw = localStorage.getItem(KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
}

export async function clearWorld() {
  try {
    const db = await open();
    await new Promise((res) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).delete(KEY); tx.oncomplete = res; tx.onerror = res; });
    db.close();
  } catch (e) { /* なし */ }
  try { localStorage.removeItem(KEY); } catch (e) { /* なし */ }
}
