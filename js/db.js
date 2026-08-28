/* =========================================================================
   js/db.js — local-first storage (IndexedDB)
   All app data lives here first. firebase-sync.js reads the "syncQueue"
   store to push changes to the cloud, and writes incoming cloud changes
   straight into these same object stores.
   ========================================================================= */

const DB_NAME = "sm-app-v2";
const DB_VERSION = 3;

const DATA_STORES = [
  "products", "customers", "sales", "repairs", "installments",
  "suppliers", "expenses", "staff", "purchaseOrders", "auditLogs",
  "attendance", "returns"
];

let _dbPromise = null;

function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = req.result;
      for (const store of DATA_STORES) {
        if (!db.objectStoreNames.contains(store)) {
          db.createObjectStore(store, { keyPath: "id" });
        }
      }
      if (!db.objectStoreNames.contains("syncQueue")) {
        db.createObjectStore("syncQueue", { keyPath: "id", autoIncrement: true });
      }
      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta", { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}

function uuid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

function tx(db, store, mode) {
  const t = db.transaction(store, mode);
  return t.objectStore(store);
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

window.DB = {
  uuid,

  async get(store, id) {
    const db = await openDB();
    return reqToPromise(tx(db, store, "readonly").get(id));
  },

  async getAll(store) {
    const db = await openDB();
    return reqToPromise(tx(db, store, "readonly").getAll());
  },

  /** Insert or update a record. Assigns id/updatedAt if missing and queues
   *  the change for cloud sync (unless queue=false, used for incoming
   *  cloud data so we don't re-queue it right back to the cloud). */
  async put(store, record, { queue = true } = {}) {
    const db = await openDB();
    if (!record.id) record.id = uuid();
    record.updatedAt = Date.now();
    await reqToPromise(tx(db, store, "readwrite").put(record));
    if (queue) await this._enqueue(store, "put", record);
    window.dispatchEvent(new CustomEvent("sm:localchange", { detail: { store } }));
    return record;
  },

  async remove(store, id, { queue = true } = {}) {
    const db = await openDB();
    await reqToPromise(tx(db, store, "readwrite").delete(id));
    if (queue) await this._enqueue(store, "delete", { id });
    window.dispatchEvent(new CustomEvent("sm:localchange", { detail: { store } }));
  },

  async _enqueue(store, op, data) {
    const db = await openDB();
    await reqToPromise(
      tx(db, "syncQueue", "readwrite").add({ store, op, data, ts: Date.now() })
    );
  },

  async getSyncQueue() {
    const db = await openDB();
    return reqToPromise(tx(db, "syncQueue", "readonly").getAll());
  },

  async removeFromQueue(id) {
    const db = await openDB();
    return reqToPromise(tx(db, "syncQueue", "readwrite").delete(id));
  },

  async clearSyncQueue() {
    const db = await openDB();
    return reqToPromise(tx(db, "syncQueue", "readwrite").clear());
  },

  async setMeta(key, value) {
    const db = await openDB();
    return reqToPromise(tx(db, "meta", "readwrite").put({ key, value }));
  },

  async getMeta(key, fallback = null) {
    const db = await openDB();
    const rec = await reqToPromise(tx(db, "meta", "readonly").get(key));
    return rec ? rec.value : fallback;
  },

  /** Export everything (for backup / moving to a new device). */
  async exportAll() {
    const out = {};
    for (const store of DATA_STORES) out[store] = await this.getAll(store);
    return out;
  },

  /** Import a previously exported backup. Overwrites matching ids. */
  async importAll(payload) {
    for (const store of DATA_STORES) {
      const rows = payload[store];
      if (!Array.isArray(rows)) continue;
      for (const rec of rows) await this.put(store, rec);
    }
  }
};
