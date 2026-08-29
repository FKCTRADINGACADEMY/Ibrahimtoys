/* =========================================================================
   js/config.js — Ibrahim Toy & Costomestic Shop
   -------------------------------------------------------------------------
   1) Sync ka istemal (cloud sync) chahiye to Firebase Console se project
      banayen -> Project settings -> General -> "Your apps" -> Web app ->
      config nikal ke neeche paste karen.
   2) Agar filhal Firebase nahi lagana, kuch mat badlen — app offline mode
      me poora kaam karega (bill, stock, profit/loss sab local save hoga),
      bas doosre device se data sync nahi hoga jab tak keys na daalen.
   ========================================================================= */

window.CFG = {
  // Shop identity (dikhne wala naam / logo)
  shopName: "Ibrahim Toy & Cosmetic Shop",
  shopTagline: "Toys for Fun, Beauty for Everyone",
  shopLogo: "assets/logo.png",
  currency: "PKR",
  currencySymbol: "Rs.",

  // Firebase project config — DISABLED for now.
  // The previous config pointed to a DIFFERENT shop's Firebase project
  // ("sheeraz-apple-point"), which caused silent permission-denied errors
  // and blocked saves. Left as placeholders below so the app runs fully
  // offline/local (all data saves to this device's IndexedDB — billing,
  // stock, customers, profit/loss all work normally).
  //
  // To re-enable cloud sync later: create YOUR OWN Firebase project at
  // https://console.firebase.google.com, enable Firestore + Email/Password
  // Auth, then paste that project's own web-app config here.
  firebase: {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT.firebaseapp.com",
    projectId: "YOUR_PROJECT",
    storageBucket: "YOUR_PROJECT.firebasestorage.app",
    messagingSenderId: "000000000000",
    appId: "1:000000000000:web:0000000000000000000000"
  },

  // Cloud data path — har shop ka data isolate rehta hai is path ke neeche.
  // Ek hi Firebase project me kai shops chalani hon to alag shopId use karen.
  shopId: "ibrahim-toy-cosmetic",

  // Low-stock alert threshold (dashboard par warning ke liye), per-product
  // override "lowStockAt" field se ho sakta hai.
  defaultLowStockThreshold: 5,

  // Thermal receipt printer paper width: "58mm" ya "80mm"
  receiptPaperWidth: "80mm",
  receiptFooterNote: "Shukriya! Dobara tashreef laayen."
};
