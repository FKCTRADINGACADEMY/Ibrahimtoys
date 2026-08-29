# Ibrahim Toys & Cosmetics — POS, Invoicing &amp; Inventory

Modern, offline-first POS (Point of Sale) and inventory management app. Sirf shop admin login kar sakta hai (koi customer signup nahi). Firestore ki offline persistence ki wajah se dukaan mein internet na ho tab bhi kaam karta hai — jaise hi connection wapas aata hai, sab data (stock + sales) khud-ba-khud sync ho jata hai.

## Features
- Admin-only login (email + password), with the shop's real logo on the login/dashboard screens
- Colorful, card-based dashboard redesign (gradient welcome banner, icon stat cards, gradient sidebar with active-item highlight)
- **Billing / POS screen** — product picker, cart, quantity control, discount, customer name/phone, payment method (Cash / Card / EasyPaisa / JazzCash / Bank Transfer)
- **Offers / Discounts** — create % discount offers (with optional code, category, active/inactive), apply them straight to a sale from the POS screen with one tap
- **Invoice generation & printing** — auto invoice number, printable receipt, reprint anytime from Sales History
- **Auto stock deduction** on every sale (and auto restock if an invoice is deleted)
- **Customer records** — add customers manually, or let the app auto-save them from POS checkout (by phone number); each customer card shows live order count & total spent
- **Best Sellers** — ranked list of top-selling products, filterable by All-time / 30 days / 7 days
- **Notifications** — bell icon in the topbar with a live badge for low-stock alerts and today's sales
- **Sales History** — search by invoice #/customer, filter by date, view/reprint/delete any invoice
- Add / edit / delete products, Toys aur Cosmetics categories
- Real-time stock tracking + low-stock alerts
- Dashboard: total products, total customers, category counts, low stock, stock value, today's sales, today's profit, invoices today, recent sales
- Offline support (Firestore local cache, auto-sync) — billing works even with no internet, sales queue up and sync later
- Search + category filters
- Light/Dark mode
- Fully responsive (mobile/tablet/desktop)
- **Installable PWA** — phone/laptop par app ki tarah install ho sakta hai, apna icon aur offline app-shell ke sath

## Project Structure
```
ibrahim-toys-cosmetics/
├── index.html          # Login page
├── dashboard.html       # Inventory dashboard (main app)
├── css/style.css
├── js/
│   ├── firebase-config.js
│   ├── auth.js
│   ├── inventory.js
│   ├── pos.js
│   └── extra.js          # Notifications, Best Sellers, Offers, Customers
├── img/                   # In-app logo (login card, sidebar brand)
├── firestore.rules      # Security rules (admin-only access, incl. offers & customers)
├── manifest.json         # PWA manifest (installable app)
├── sw.js                 # Service worker (offline app-shell cache)
├── favicon.ico
├── icons/                # App icons (all sizes, incl. maskable)
└── README.md
```

No build step, no npm needed — sirf plain HTML/CSS/JS hai jo directly browser mein chalta hai.

---

## 1. Firebase Console Setup (zaroori — ek dafa karna hai)

1. [Firebase Console](https://console.firebase.google.com/) kholein → project **ibrahim-toyss** select karein.
2. **Build → Authentication → Get Started** → **Sign-in method** tab → **Email/Password** ko enable karein.
3. **Authentication → Users → Add user** → apna admin email + password dalein. Yehi credentials login page par use hongi.
4. **Build → Firestore Database → Create database** → production mode mein start karein (agar pehle se nahi bani).
5. **Firestore → Rules** tab mein jaayein aur is repo ki `firestore.rules` file ka content paste karke **Publish** karein — is se sirf logged-in admin hi data (products aur sales dono) padh/likh sakega.

Bas! Ab app ready hai use karne ke liye.

---

## 2. GitHub Par Push Karna

Terminal mein project folder ke andar jaake:

```bash
cd ibrahim-toys-cosmetics
git init
git add .
git commit -m "Initial commit: Ibrahim Toys & Cosmetics inventory app"
git branch -M main
git remote add origin https://github.com/<aapka-username>/<repo-name>.git
git push -u origin main
```

> `<aapka-username>` aur `<repo-name>` apni GitHub repo ke mutabiq badal dein. Repo pehle GitHub par bana lein (empty repo, bina README ke).

---

## 3. Hosting / Deploy Karna (optional, free)

### Option A — GitHub Pages (sabse aasan)
1. GitHub repo → **Settings → Pages**
2. Source: **Deploy from a branch** → Branch: `main` → folder: `/ (root)` → Save
3. Kuch minute baad `https://<username>.github.io/<repo-name>/` par app live ho jayega.

### Option B — Firebase Hosting
```bash
npm install -g firebase-tools
firebase login
firebase init hosting   # public directory: . (current folder), single-page app: No
firebase deploy
```

---

## 4. Offline/Online Kaise Kaam Karta Hai

- App load hote hi Firestore data local browser cache mein bhi save kar leta hai.
- Agar internet chala jaye, aap phir bhi products add/edit/delete kar sakte hain — top bar par "Offline" status dikhega.
- Jaise hi internet wapas aata hai, sab pending changes khud automatically Firebase server par sync ho jate hain — kuch alag se karne ki zaroorat nahi.

## 5. App Install Karna (PWA)

App ko phone ya laptop par ek real app ki tarah install kiya ja sakta hai — apna icon home screen/desktop par, apni window (browser address bar nahi), aur offline app khulne ki sahulat.

> **Zaroori:** PWA install sirf HTTPS par kaam karta hai (GitHub Pages aur Firebase Hosting dono HTTPS par hi serve karte hain, to deploy karne ke baad ye khud kaam kar jayega). Localhost par bhi test ho sakta hai.

- **Android (Chrome):** Site kholein → login karke dashboard par aayein → top bar mein **"⭳ Install App"** button dabayein, ya Chrome ke 3-dot menu → **Add to Home screen**.
- **iPhone (Safari):** Site kholein → Share icon → **Add to Home Screen**.
- **Desktop (Chrome/Edge):** Address bar ke end mein install icon (⊕) par click karein, ya dashboard ka **Install App** button use karein.

Install hone ke baad app bina internet ke bhi khulega (app ka design/shell cached hota hai), aur products ka data offline add/edit hoke connection wapas aane par khud sync ho jata hai.

## 6. Security Note

`js/firebase-config.js` mein maujood Firebase config (apiKey waghera) publicly expose hona normal hai — Firebase web apps aisi hi kaam karti hain. Asal security **Firestore Rules** se aati hai (upar dekhein), jo ensure karti hai ke sirf logged-in admin hi data access kar sake. Isliye Authentication mein sirf apna trusted admin account hi add karein.
