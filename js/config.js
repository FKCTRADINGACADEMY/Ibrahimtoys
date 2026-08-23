/**
 * Sheeraz Apple Point — Kamber
 * Firebase project: sheeraz-apple-point
 */
window.SHOP_CONFIG = {
  shopName: "Sheeraz Apple Point",
  shopNameShort: "SHEERAZ APPLE POINT",
  shopTagline: "KAMBER · BHUTTO CHOWK",
  shopSubtitle: "Mobiles · Accessories · Repairs · Service",
  phone: "03100014727",
  address: "Ali Khan Mirzani Center, Bhutto Chowk, Kamber",
  ownerName: "Sheeraz Ali",
  creditLine: "Sheeraz Apple Point · Kamber",
  creditPhone: "03100014727",

  shopId: "sheeraz-apple-point",

  firebase: {
    apiKey: "AIzaSyCiZlQNNahbM8dMg5KlS_WDOL0x0NTZiCs",
    authDomain: "sheeraz-apple-point.firebaseapp.com",
    projectId: "sheeraz-apple-point",
    storageBucket: "sheeraz-apple-point.firebasestorage.app",
    messagingSenderId: "786751552575",
    appId: "1:786751552575:web:3cea064213b5e8e9180c8a"
  }
};

window.CFG = window.SHOP_CONFIG;
window.creditFooter = () =>
  (CFG.creditLine || "") + (CFG.creditPhone ? " · " + CFG.creditPhone : "");
