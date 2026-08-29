/* firebase-sync.js — CFG-based cloud sync (works for any shop) + push-first fullResync
   Firebase keys + shop path: js/config.js → window.CFG
*/
function getFirebaseConfig() {
  if (window.CFG && CFG.firebase) return CFG.firebase;
  if (window.CFG && CFG.firebaseConfig) return CFG.firebaseConfig;
  return null;
}

function getSyncRoot() {
  // e.g. "shops/sheraz" or "shops/my-shop"
  if (window.CFG && CFG.syncRoot) return CFG.syncRoot;
  if (window.CFG && CFG.shopId) return "shops/" + CFG.shopId;
  if (window.CFG && CFG.shopSlug) return "shops/" + CFG.shopSlug;
  return "shops/default";
}

const SYNC_STORES = [
  "products", "customers", "sales", "repairs", "installments",
  "suppliers", "expenses", "staff", "purchaseOrders", "auditLogs",
  "attendance", "returns"
];

window.SMSync = {
  _ready: false,
  _db: null,
  _auth: null,
  _unsubs: [],
  _flushing: false,
  _root: null,

  isReady() { return this._ready && !!this._db; },
  isConfigured() {
    const c = getFirebaseConfig();
    return !!(c && c.apiKey && c.apiKey !== "YOUR_API_KEY");
  },

  async init() {
    if (!this.isConfigured()) {
      console.info("[SMSync] Firebase not configured in CFG — offline-only.");
      return;
    }
    if (typeof firebase === "undefined") {
      console.warn("[SMSync] SDK not loaded");
      return;
    }
    try {
      const FIREBASE_CONFIG = getFirebaseConfig();
      this._root = getSyncRoot();
      if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
      this._auth = firebase.auth();
      try {
        await this._auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
      } catch (e) {}
      this._db = firebase.firestore();
      try {
        await this._db.enablePersistence({ synchronizeTabs: true });
      } catch (e) {}
      this._ready = true;
      console.info("[SMSync] Firebase ready · root:", this._root);

      this._auth.onAuthStateChanged(async (user) => {
        if (user) {
          console.info("[SMSync] Signed in", user.email || user.uid);
          await this.startListeners();
          await this.flushQueue();
          setTimeout(() => this.pullAll().catch(() => {}), 800);
        } else {
          this.stopListeners();
        }
      });
    } catch (err) {
      console.error("[SMSync] Init failed:", err);
      this._ready = false;
    }
  },

  _col(store) {
    return this._db.collection(this._root + "/" + store);
  },

  async signIn(email, password) {
    if (!this._auth) throw new Error("Firebase not ready");
    const cred = await this._auth.signInWithEmailAndPassword(email, password);
    return cred.user;
  },

  async signUp(email, password) {
    if (!this._auth) throw new Error("Firebase not ready");
    const cred = await this._auth.createUserWithEmailAndPassword(email, password);
    return cred.user;
  },

  async signOut() {
    if (this._auth) await this._auth.signOut();
  },

  currentUser() {
    return this._auth ? this._auth.currentUser : null;
  },

  async startListeners() {
    this.stopListeners();
    if (!this._db) return;
    for (const store of SYNC_STORES) {
      const col = this._col(store);
      const unsub = col.onSnapshot(
        async (snap) => {
          let changed = false;
          for (const change of snap.docChanges()) {
            const data = change.doc.data();
            if (!data || !data.id) continue;
            if (change.type === "removed") continue;
            const local = await DB.get(store, data.id);
            if (!local || (data.updatedAt || 0) >= (local.updatedAt || 0)) {
              await this._putLocalOnly(store, data);
              changed = true;
            }
          }
          if (changed) window.dispatchEvent(new CustomEvent("sm:synced"));
        },
        (err) => console.warn("[SMSync] Listener", store, err)
      );
      this._unsubs.push(unsub);
    }
  },

  stopListeners() {
    this._unsubs.forEach((u) => u());
    this._unsubs = [];
  },

  async _putLocalOnly(storeName, record) {
    const db = await openDBForSync();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      tx.objectStore(storeName).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  _compact(data) {
    if (!data || typeof data !== "object") return {};
    const out = {};
    for (const [k, v] of Object.entries(data)) {
      if (v === undefined || v === null) continue;
      if (typeof v === "string" && v.length > 15000) out[k] = v.slice(0, 15000);
      else if (k === "items" && Array.isArray(v)) {
        out[k] = v.slice(0, 150).map((it) => ({
          id: it.id,
          name: String(it.name || "").slice(0, 100),
          price: Number(it.price) || 0,
          cost: Number(it.cost) || 0,
          qty: Number(it.qty) || 0
        }));
      } else if (typeof v !== "function") out[k] = v;
    }
    return out;
  },

  async flushQueue() {
    if (!this.isReady() || this._flushing || !navigator.onLine) return;
    const user = this.currentUser();
    if (!user) return;

    this._flushing = true;
    try {
      const queue = await DB.getSyncQueue();
      const batch = queue.slice(0, 100);
      for (const item of batch) {
        try {
          if (!item.data || !item.data.id) {
            await DB.removeFromQueue(item.id);
            continue;
          }
          const ref = this._col(item.store).doc(String(item.data.id));

          if (item.op === "delete") {
            await ref.delete();
          } else {
            const payload = this._compact(item.data);
            payload._syncedAt = Date.now();
            payload._by = user.uid;
            if (JSON.stringify(payload).length > 900000) {
              console.warn("[SMSync] skip oversized", item.store, item.data.id);
              await DB.removeFromQueue(item.id);
              continue;
            }
            await ref.set(payload, { merge: true });
          }
          await DB.removeFromQueue(item.id);
        } catch (err) {
          console.warn("[SMSync] item fail", item.id, err);
        }
      }
      if (batch.length > 0) window.dispatchEvent(new CustomEvent("sm:synced"));
    } finally {
      this._flushing = false;
    }
  },

  async clearPending() {
    await DB.clearSyncQueue();
    window.dispatchEvent(new CustomEvent("sm:synced"));
  },

  async pullAll() {
    if (!this.isReady() || !this.currentUser()) return;
    for (const store of SYNC_STORES) {
      try {
        const snap = await this._col(store).get();
        for (const doc of snap.docs) {
          const data = doc.data();
          if (data && data.id) await this._putLocalOnly(store, data);
        }
      } catch (e) {
        console.warn("[SMSync] pull", store, e);
      }
    }
    window.dispatchEvent(new CustomEvent("sm:synced"));
  },

  async pushAll() {
    if (!this.isReady() || !this.currentUser()) return 0;
    const user = this.currentUser();
    let n = 0;
    for (const store of SYNC_STORES) {
      const rows = await DB.getAll(store);
      for (const rec of rows) {
        if (!rec.id) continue;
        try {
          const payload = this._compact(rec);
          payload._syncedAt = Date.now();
          payload._by = user.uid;
          if (!payload.updatedAt) payload.updatedAt = Date.now();
          await this._col(store).doc(String(rec.id)).set(payload, { merge: true });
          n++;
        } catch (e) {
          console.warn("[SMSync] push fail", store, rec.id, e);
        }
      }
    }
    await this.clearPending();
    window.dispatchEvent(new CustomEvent("sm:synced"));
    return n;
  },

  /** Local → cloud pehle, phir cloud → local */
  async fullResync() {
    await this.clearPending();
    const n = await this.pushAll();
    await this.pullAll();
    return n;
  }
};

function openDBForSync() {
  return new Promise((resolve, reject) => {
    // must match the DB name used in db.js
    const req = indexedDB.open("sm-app-v2", 3);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => SMSync.init());
} else {
  SMSync.init();
}

window.addEventListener("online", () => {
  if (SMSync.isReady()) {
    SMSync.flushQueue().catch(console.warn);
    setTimeout(() => SMSync.pullAll().catch(() => {}), 500);
  }
});

setInterval(() => {
  if (navigator.onLine && window.SMSync && SMSync.isReady() && SMSync.currentUser()) {
    SMSync.flushQueue().catch(() => {});
  }
}, 3000);
