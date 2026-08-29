// ============================================================
// Firebase Configuration — Ibrahim Toys & Cosmetics
// ============================================================
const firebaseConfig = {
  apiKey: "AIzaSyCIUPeHupaMVlAiTkbhK0pHhYgq2VCa4JQ",
  authDomain: "ibrahim-toyss.firebaseapp.com",
  projectId: "ibrahim-toyss",
  storageBucket: "ibrahim-toyss.firebasestorage.app",
  messagingSenderId: "193122158503",
  appId: "1:193122158503:web:93d87be863c349004ad882"
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();

// Enable offline persistence — app data cached locally, syncs
// automatically to Firestore whenever the connection returns.
db.enablePersistence({ synchronizeTabs: true }).catch((err) => {
  if (err.code === "failed-precondition") {
    console.warn("Offline persistence: multiple tabs open, only one enabled.");
  } else if (err.code === "unimplemented") {
    console.warn("Offline persistence not supported in this browser.");
  }
});

const PRODUCTS_COLLECTION = "products";
const SALES_COLLECTION = "sales";
const OFFERS_COLLECTION = "offers";
const CUSTOMERS_COLLECTION = "customers";
