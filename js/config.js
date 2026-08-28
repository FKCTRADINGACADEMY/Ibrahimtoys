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
  shopName: "Ibrahim Toy & Costomestic Shop",
  shopTagline: "Toys for Fun, Beauty for Everyone",
  shopLogo: "assets/logo.png",
  currency: "PKR",
  currencySymbol: "Rs.",

  // Firebase project config — replace with YOUR project's values.
  // Firebase Console > Project settings > General > Your apps > SDK setup
  firebase: {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT.firebaseapp.com",
    projectId: "YOUR_PROJECT",
    storageBucket: "YOUR_PROJECT.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
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
