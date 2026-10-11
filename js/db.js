/* Capa de datos (repositorio).
 * Hoy persiste en IndexedDB del teléfono. Para el GMAO, reemplaza ESTA capa por
 * llamadas a tu API (fetch) manteniendo la misma interfaz: el resto de la app no cambia.
 */
const Repo = (() => {
  const DB_NAME = 'gmao-mtto';
  const VERSION = 1;
  // keyPath por colección
  const STORES = { reports: 'id', clients: 'nit', equipment: 'key', settings: 'key' };
  let dbp;

  function open() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open(DB_NAME, VERSION);
      r.onupgradeneeded = () => {
        for (const [name, keyPath] of Object.entries(STORES)) {
          if (!r.result.objectStoreNames.contains(name)) r.result.createObjectStore(name, { keyPath });
        }
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbp;
  }

  async function tx(store, mode, fn) {
    const db = await open();
    return new Promise((res, rej) => {
      const t = db.transaction(store, mode);
      const out = fn(t.objectStore(store));
      t.oncomplete = () => res(out && 'result' in out ? out.result : out);
      t.onerror = () => rej(t.error);
    });
  }

  const collection = (name) => ({
    all: () => tx(name, 'readonly', (s) => s.getAll()),
    get: (k) => tx(name, 'readonly', (s) => s.get(k)),
    put: (v) => tx(name, 'readwrite', (s) => { s.put(v); }),
    delete: (k) => tx(name, 'readwrite', (s) => { s.delete(k); }),
  });

  const reports = collection('reports');
  const clients = collection('clients');
  const equipment = collection('equipment');
  const settingsC = collection('settings');

  return {
    reports, clients, equipment,
    settings: {
      get: async (key, def) => (await settingsC.get(key))?.value ?? def,
      set: (key, value) => settingsC.put({ key, value }),
    },
    // Respaldo / migración al GMAO
    async exportAll() {
      return {
        version: 1, exportedAt: new Date().toISOString(),
        reports: await reports.all(), clients: await clients.all(),
        equipment: await equipment.all(), settings: await settingsC.all(),
      };
    },
    async importAll(data) {
      for (const r of data.reports || []) await reports.put(r);
      for (const c of data.clients || []) await clients.put(c);
      for (const e of data.equipment || []) await equipment.put(e);
      for (const s of data.settings || []) await settingsC.put(s);
    },
  };
})();
