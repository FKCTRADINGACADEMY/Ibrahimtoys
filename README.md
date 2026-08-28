# Ibrahim Toy & Costomestic Shop — POS + Inventory Software

Modern, installable (PWA) shop software: login/dashboard, POS billing, wholesale
stock-in, product/supplier/customer records, expenses, profit/loss reports, aur
thermal printer receipt printing. Firebase se cloud sync optional hai — Firebase
ke bina bhi (offline mode) poora software chalta hai.

## 1. Firebase lagana (cloud sync ke liye — optional)

1. https://console.firebase.google.com par jaake naya project banayen.
2. **Build > Authentication > Sign-in method** me "Email/Password" enable karen.
3. **Build > Firestore Database** me database create karen (production mode).
4. **Project settings (⚙️) > General > Your apps** me "Web app" (`</>`) add karen.
5. Wahan se milne wala config object copy karen — ye kuch is tarah dikhta hai:
   ```js
   {
     apiKey: "AIza...",
     authDomain: "xxx.firebaseapp.com",
     projectId: "xxx",
     storageBucket: "xxx.appspot.com",
     messagingSenderId: "...",
     appId: "..."
   }
   ```
6. Ye values `js/config.js` file me `firebase: {...}` ke andar paste kar den
   (placeholder values `"YOUR_API_KEY"` waghera replace karen).
7. **Firestore > Rules** me apne aap ko auth-only access den, misal:
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /{document=**} {
         allow read, write: if request.auth != null;
       }
     }
   }
   ```
8. Save karen, publish karen. Ab jab app open hogi aur aap login/signup karenge
   to data automatically Firebase Firestore me sync hoga (multi-device sync).

**Agar filhal Firebase nahi lagana:** kuch mat karen — app offline mode me poora
kaam karega (bill banana, stock, profit/loss sab kuch), sirf doosre device se
sync nahi hoga. Default login: `admin` / `admin123` (Settings me se app ke andar
"Create New Account" se naya user bhi bana sakte hain).

## 2. GitHub par upload karna

Ye pura folder (`shop/`) apne GitHub repo me upload kar den:

```bash
git init
git add .
git commit -m "Ibrahim Toy & Costomestic Shop — POS software"
git branch -M main
git remote add origin <your-repo-url>
git push -u origin main
```

Free hosting ke liye **GitHub Pages** use kar sakte hain:
Repo → Settings → Pages → Branch: `main` → Save. Kuch minute me link mil jayega
(e.g. `https://username.github.io/repo-name/`).

## 3. Software kaise use hoga

- **Login screen** — apka logo aur shop ka naam sath, email/password se login.
- **Dashboard** — aaj ki sale, aaj ka profit, stock value, low-stock warnings,
  pichle 7 din ka sales trend.
- **Sell (POS)** — product par tap karen, cart me add hoga, discount/customer/
  payment method choose kar ke **Checkout** karen — stock khud kam hoga aur
  thermal printer receipt print hogi.
- **Stock In (Wholesale)** — jab wholesale se maal aaye: supplier choose karen,
  har item ka qty + wholesale cost + retail sell price add karen, **Save** karen
  — stock khud badh jayega.
- **Products** — sab items ki list, edit/delete, low-stock highlight hota hai.
- **Suppliers / Customers** — contacts save karen.
- **Expenses** — dukan ka kiraya, bill waghera add karen (profit/loss me minus hote hain).
- **Reports** — Today / Week / Month / Custom date range — Revenue, Cost, Gross
  Profit, Expenses, Net Profit, stock valuation, top-selling products, aur CSV
  export.
- **Settings** — sync status, manual sync, backup download/restore (JSON),
  test print, app install button.

## 4. Thermal printer

Checkout ya "reprint" par ek chota print-window khulti hai jo seedha print
dialog laati hai (80mm paper default — `js/config.js` me `receiptPaperWidth`
se `58mm` bhi kar sakte hain). Apka thermal printer (USB/Bluetooth/network)
jo bhi phone/PC/POS terminal me "printer" ki tarah install ho, wahi print
dialog me select kar len.

## 5. App install karna (PWA)

Chrome/Edge me address bar ke "Install" icon se, ya mobile par browser menu
me "Add to Home Screen" se — ye software normal app ki tarah install ho jata
hai, offline bhi chalta hai.

## 6. File structure

```
index.html
manifest.json
service-worker.js
css/style.css
js/config.js          ← Firebase keys + shop settings YAHAN dalen
js/db.js               ← local storage (IndexedDB)
js/firebase-sync.js    ← cloud sync engine
js/thermal-printer.js  ← receipt printing
js/app.js               ← poora app logic (login, POS, stock, reports)
assets/logo.png
icons/                  ← app icons (sab sizes, aapke logo se generate)
```
