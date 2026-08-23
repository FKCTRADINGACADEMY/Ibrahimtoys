# Sheeraz Apple Point — PWA

**Kamber · Ali Khan Mirzani Center, Bhutto Chowk**  
Phone: 03100014727 · Owner: Sheeraz Ali

Offline-first shop POS: sales, stock, repairs, installments, returns, Firebase sync, thermal printer.

## Login
- Firebase **email/password** (Console → Authentication → user banao)
- Staff: local name/phone + PIN (Staff module)
- Session save → **offline** use after first login

## Firebase
Project: `sheeraz-apple-point`  
Config: `js/config.js`  
Rules: authenticated read/write on `shops/{shopId}/{document=**}`

## Deploy
GitHub Pages / any static host. HTTPS required for PWA + camera + Bluetooth printer.
