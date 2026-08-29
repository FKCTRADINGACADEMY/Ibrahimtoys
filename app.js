/* =========================================================================
   js/app.js — Ibrahim Toy & Costomestic Shop · POS + Inventory + Reports
   ========================================================================= */

const App = {
  user: null,
  cart: [],           // active POS cart: {productId,name,price,cost,qty,stock}
  editingReturnFor: null,
  reportRange: "today",
  reportFrom: null,
  reportTo: null,
  productFilter: "",
  categoryFilter: "",
};

/* ---------------------------------------------------------------------- */
/* Helpers                                                                 */
/* ---------------------------------------------------------------------- */

function money(n) {
  const sym = (window.CFG && CFG.currencySymbol) || "";
  return sym + " " + (Math.round((Number(n) || 0) * 100) / 100).toLocaleString("en-PK");
}
function esc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function uid() { return DB.uuid(); }
function todayKey(ts) { return new Date(ts).toISOString().slice(0, 10); }
function fmtDate(ts) { return new Date(ts).toLocaleString("en-PK", { dateStyle: "medium", timeStyle: "short" }); }
function fmtDateOnly(ts) { return new Date(ts).toLocaleDateString("en-PK", { dateStyle: "medium" }); }
function $(sel, root = document) { return root.querySelector(sel); }
function $all(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

function toast(msg, kind = "ok") {
  let box = $("#toastBox");
  if (!box) {
    box = document.createElement("div");
    box.id = "toastBox";
    document.body.appendChild(box);
  }
  const t = document.createElement("div");
  t.className = "toast toast-" + kind;
  t.textContent = msg;
  box.appendChild(t);
  requestAnimationFrame(() => t.classList.add("show"));
  setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 250); }, 2600);
}

function openModal(innerHtml, wide = false) {
  closeModal();
  const overlay = document.createElement("div");
  overlay.id = "modalOverlay";
  overlay.className = "modal-overlay";
  overlay.innerHTML = `<div class="modal-card ${wide ? "modal-wide" : ""}">${innerHtml}</div>`;
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeModal(); });
  document.body.appendChild(overlay);
}
function closeModal() {
  const m = $("#modalOverlay");
  if (m) m.remove();
}

async function logAudit(action, detail) {
  try {
    await DB.put("auditLogs", {
      id: uid(), action, detail, user: (App.user && (App.user.email || App.user.name)) || "unknown",
      date: Date.now()
    });
  } catch (e) { /* non-fatal */ }
}

/* ---------------------------------------------------------------------- */
/* Local (offline) auth fallback — used when Firebase isn't configured     */
/* ---------------------------------------------------------------------- */

function simpleHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) { h = (h * 31 + str.charCodeAt(i)) | 0; }
  return "h" + h;
}

async function ensureLocalAdmin() {
  const existing = await DB.getMeta("localAuthUsers");
  if (!existing) {
    await DB.setMeta("localAuthUsers", [
      { username: "admin", passHash: simpleHash("admin123"), name: "Admin" }
    ]);
  }
}

async function localSignIn(username, password) {
  const users = (await DB.getMeta("localAuthUsers")) || [];
  const u = users.find(x => x.username.toLowerCase() === String(username).trim().toLowerCase());
  if (!u || u.passHash !== simpleHash(password)) throw new Error("Ghalat email/password.");
  return { local: true, name: u.name || u.username, email: u.username };
}

async function localSignUp(username, password, name) {
  const users = (await DB.getMeta("localAuthUsers")) || [];
  if (users.find(x => x.username.toLowerCase() === String(username).trim().toLowerCase())) {
    throw new Error("Ye account pehle se maujood hai.");
  }
  users.push({ username: username.trim(), passHash: simpleHash(password), name: name || username });
  await DB.setMeta("localAuthUsers", users);
  return { local: true, name: name || username, email: username };
}

/* ---------------------------------------------------------------------- */
/* Business logic                                                          */
/* ---------------------------------------------------------------------- */

async function getProducts() { return (await DB.getAll("products")).sort((a, b) => a.name.localeCompare(b.name)); }
async function getSuppliers() { return (await DB.getAll("suppliers")).sort((a, b) => a.name.localeCompare(b.name)); }
async function getCustomers() { return (await DB.getAll("customers")).sort((a, b) => a.name.localeCompare(b.name)); }
async function getSales() { return (await DB.getAll("sales")).sort((a, b) => b.date - a.date); }
async function getExpenses() { return (await DB.getAll("expenses")).sort((a, b) => b.date - a.date); }
async function getPurchases() { return (await DB.getAll("purchaseOrders")).sort((a, b) => b.date - a.date); }

function lowStockThreshold(p) {
  return Number.isFinite(p.lowStockAt) ? p.lowStockAt : ((window.CFG && CFG.defaultLowStockThreshold) || 5);
}

function rangeBounds() {
  const now = new Date();
  let from, to;
  if (App.reportRange === "today") {
    from = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    to = from + 86400000;
  } else if (App.reportRange === "week") {
    const day = now.getDay();
    const start = new Date(now); start.setDate(now.getDate() - day); start.setHours(0, 0, 0, 0);
    from = start.getTime(); to = from + 7 * 86400000;
  } else if (App.reportRange === "month") {
    from = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    to = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
  } else {
    from = App.reportFrom ? new Date(App.reportFrom).getTime() : 0;
    to = App.reportTo ? new Date(App.reportTo).getTime() + 86400000 : Date.now() + 86400000;
  }
  return { from, to };
}

async function computeReport() {
  const { from, to } = rangeBounds();
  const sales = (await getSales()).filter(s => s.date >= from && s.date < to && !s.returned);
  const expenses = (await getExpenses()).filter(e => e.date >= from && e.date < to);
  const products = await getProducts();

  let revenue = 0, cogs = 0, discountTotal = 0;
  const soldCount = {};
  for (const s of sales) {
    revenue += s.total;
    discountTotal += s.discount || 0;
    for (const it of s.items) {
      cogs += (it.cost || 0) * it.qty;
      soldCount[it.name] = (soldCount[it.name] || 0) + it.qty;
    }
  }
  const expenseTotal = expenses.reduce((a, e) => a + Number(e.amount || 0), 0);
  const grossProfit = revenue - cogs;
  const netProfit = grossProfit - expenseTotal;

  const stockCostValue = products.reduce((a, p) => a + (p.costPrice || 0) * (p.stock || 0), 0);
  const stockRetailValue = products.reduce((a, p) => a + (p.sellPrice || 0) * (p.stock || 0), 0);

  const topSelling = Object.entries(soldCount).sort((a, b) => b[1] - a[1]).slice(0, 5);

  return { sales, expenses, revenue, cogs, discountTotal, expenseTotal, grossProfit, netProfit, stockCostValue, stockRetailValue, topSelling };
}

async function last7DaysSales() {
  const sales = await getSales();
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0, 0, 0, 0);
    const key = todayKey(d.getTime());
    const total = sales.filter(s => !s.returned && todayKey(s.date) === key).reduce((a, s) => a + s.total, 0);
    days.push({ label: d.toLocaleDateString("en-PK", { weekday: "short" }), total });
  }
  return days;
}

/* ---------------------------------------------------------------------- */
/* Rendering shell                                                         */
/* ---------------------------------------------------------------------- */

function appRoot() { return document.getElementById("app"); }

async function render() {
  if (!App.user) return renderLogin();
  const hash = location.hash.replace("#/", "") || "dashboard";
  const [route] = hash.split("?");
  const routes = {
    dashboard: renderDashboard,
    pos: renderPOS,
    purchase: renderPurchase,
    products: renderProducts,
    suppliers: renderSuppliers,
    customers: renderCustomers,
    expenses: renderExpenses,
    reports: renderReports,
    settings: renderSettings,
  };
  const fn = routes[route] || renderDashboard;
  await renderShell(route);
  await fn();
}

async function renderShell(activeRoute) {
  const cfg = window.CFG || {};
  const syncOn = window.SMSync && SMSync.isConfigured();
  appRoot().innerHTML = `
    <div class="shell">
      <aside class="sidebar">
        <div class="brand">
          <img src="${esc(cfg.shopLogo || "assets/logo.png")}" alt="logo" class="brand-logo" onerror="this.style.display='none'"/>
          <div class="brand-text">
            <div class="brand-name">${esc(cfg.shopName || "Shop")}</div>
            <div class="brand-tag">${esc(cfg.shopTagline || "")}</div>
          </div>
        </div>
        <nav class="navlinks">
          ${navLink("dashboard", "🏠", "Dashboard", activeRoute)}
          ${navLink("pos", "🧾", "Sell (POS)", activeRoute)}
          ${navLink("purchase", "📦", "Stock In (Wholesale)", activeRoute)}
          ${navLink("products", "🧸", "Products", activeRoute)}
          ${navLink("suppliers", "🚚", "Suppliers", activeRoute)}
          ${navLink("customers", "👤", "Customers", activeRoute)}
          ${navLink("expenses", "💸", "Expenses", activeRoute)}
          ${navLink("reports", "📊", "Reports / Profit", activeRoute)}
          ${navLink("settings", "⚙️", "Settings", activeRoute)}
        </nav>
        <div class="sidebar-footer">
          <div class="sync-pill ${syncOn ? "on" : "off"}" data-action="sync-now" title="Tap to sync now">
            <span class="dot"></span> ${syncOn ? "Cloud sync on" : "Offline mode"}
          </div>
          <button class="btn btn-ghost btn-block" data-action="logout">Logout</button>
        </div>
      </aside>
      <div class="main">
        <header class="topbar">
          <button class="hamburger" data-action="toggle-sidebar">☰</button>
          <div class="topbar-title">${navTitle(activeRoute)}</div>
          <div class="topbar-user">👋 ${esc((App.user && (App.user.name || App.user.email)) || "")}</div>
        </header>
        <main class="content" id="content"></main>
      </div>
    </div>
  `;
}

function navLink(route, icon, label, active) {
  return `<a href="#/${route}" class="navlink ${active === route ? "active" : ""}">
    <span class="ic">${icon}</span><span>${label}</span>
  </a>`;
}
function navTitle(route) {
  const map = {
    dashboard: "Dashboard", pos: "Sell (POS)", purchase: "Stock In · Wholesale Purchase",
    products: "Products & Inventory", suppliers: "Suppliers", customers: "Customers",
    expenses: "Expenses", reports: "Reports & Profit / Loss", settings: "Settings"
  };
  return map[route] || "";
}

/* ---------------------------------------------------------------------- */
/* Login screen                                                            */
/* ---------------------------------------------------------------------- */

function renderLogin() {
  const cfg = window.CFG || {};
  appRoot().innerHTML = `
  <div class="login-wrap">
    <div class="login-decor">
      <div class="blob blob-a"></div>
      <div class="blob blob-b"></div>
    </div>
    <div class="login-card">
      <div class="login-logo-wrap">
        <img src="${esc(cfg.shopLogo || "assets/logo.png")}" class="login-logo" alt="logo" onerror="this.style.display='none'"/>
      </div>
      <h1 class="login-shop-name">${esc(cfg.shopName || "Shop")}</h1>
      <p class="login-tagline">${esc(cfg.shopTagline || "")}</p>

      <form id="loginForm" class="login-form">
        <label class="field">
          <span class="field-ic">👤</span>
          <input type="text" name="email" placeholder="Email or Phone" autocomplete="username" required />
        </label>
        <label class="field">
          <span class="field-ic">🔒</span>
          <input type="password" name="password" id="loginPass" placeholder="Password" autocomplete="current-password" required />
          <button type="button" class="field-eye" data-action="toggle-pass">👁</button>
        </label>
        <div class="login-row">
          <label class="remember"><input type="checkbox" name="remember" checked/> Remember Me</label>
          <a href="#" class="forgot" data-action="forgot">Forgot Password?</a>
        </div>
        <button type="submit" class="btn btn-primary btn-block btn-lg" id="loginBtn">↪ &nbsp;Login</button>
      </form>

      <div class="or-divider"><span>OR</span></div>

      <button class="btn btn-outline btn-block btn-lg" data-action="show-signup">➕&nbsp; Create New Account</button>

      <form id="signupForm" class="login-form hidden">
        <label class="field">
          <span class="field-ic">🏷</span>
          <input type="text" name="name" placeholder="Your Name" required/>
        </label>
        <label class="field">
          <span class="field-ic">👤</span>
          <input type="text" name="email" placeholder="Email" required/>
        </label>
        <label class="field">
          <span class="field-ic">🔒</span>
          <input type="password" name="password" placeholder="Password (6+ characters)" minlength="6" required/>
        </label>
        <button type="submit" class="btn btn-primary btn-block btn-lg">Create Account</button>
        <button type="button" class="btn btn-ghost btn-block" data-action="show-login">← Back to Login</button>
      </form>

      <div class="login-features">
        <div class="lf"><div class="lf-ic">🛡</div><div><b>Secure Login</b><span>Your data is safe with us</span></div></div>
        <div class="lf"><div class="lf-ic">🛍</div><div><b>Quality Products</b><span>Toys &amp; Cosmetics best quality</span></div></div>
        <div class="lf"><div class="lf-ic">🎧</div><div><b>24/7 Support</b><span>We are here to help you</span></div></div>
      </div>
      <p class="login-footer">© ${new Date().getFullYear()} ${esc(cfg.shopName || "Shop")} · All Rights Reserved</p>
      ${!(window.SMSync && SMSync.isConfigured()) ? `<p class="offline-note">Offline mode — cloud sync ke liye <code>js/config.js</code> me Firebase keys add karen. Default login: <b>admin</b> / <b>admin123</b></p>` : ""}
    </div>
  </div>`;
}

/* ---------------------------------------------------------------------- */
/* Dashboard                                                                */
/* ---------------------------------------------------------------------- */

async function renderDashboard() {
  const products = await getProducts();
  const sales = await getSales();
  const todayFrom = new Date(); todayFrom.setHours(0, 0, 0, 0);
  const todaySales = sales.filter(s => !s.returned && s.date >= todayFrom.getTime());
  const todayRevenue = todaySales.reduce((a, s) => a + s.total, 0);
  const todayCogs = todaySales.reduce((a, s) => a + s.items.reduce((x, it) => x + (it.cost || 0) * it.qty, 0), 0);
  const todayProfit = todayRevenue - todayCogs;

  const stockCostValue = products.reduce((a, p) => a + (p.costPrice || 0) * (p.stock || 0), 0);
  const stockRetailValue = products.reduce((a, p) => a + (p.sellPrice || 0) * (p.stock || 0), 0);
  const lowStock = products.filter(p => (p.stock || 0) <= lowStockThreshold(p));
  const trend = await last7DaysSales();
  const maxTrend = Math.max(1, ...trend.map(d => d.total));

  $("#content").innerHTML = `
    <div class="cards-grid">
      ${statCard("🧾", "Today's Sales", money(todayRevenue), "")}
      ${statCard("📈", "Today's Profit", money(todayProfit), todayProfit >= 0 ? "good" : "bad")}
      ${statCard("📦", "Stock Value (cost)", money(stockCostValue), "")}
      ${statCard("🏷", "Stock Value (retail)", money(stockRetailValue), "")}
      ${statCard("⚠️", "Low Stock Items", lowStock.length, lowStock.length ? "warn" : "")}
      ${statCard("🧸", "Total Products", products.length, "")}
    </div>

    <div class="panel-grid">
      <section class="panel">
        <h3>Last 7 Days Sales</h3>
        <div class="bars">
          ${trend.map(d => `
            <div class="bar-col">
              <div class="bar" style="height:${Math.max(4, (d.total / maxTrend) * 100)}%" title="${money(d.total)}"></div>
              <div class="bar-label">${d.label}</div>
            </div>`).join("")}
        </div>
      </section>

      <section class="panel">
        <h3>Low Stock Alerts</h3>
        ${lowStock.length === 0 ? `<p class="muted">Sab stock theek hai 👍</p>` : `
        <table class="mini-table">
          <thead><tr><th>Product</th><th>Stock</th></tr></thead>
          <tbody>
            ${lowStock.slice(0, 8).map(p => `<tr><td>${esc(p.name)}</td><td class="warn-text">${p.stock || 0} ${esc(p.unit || "")}</td></tr>`).join("")}
          </tbody>
        </table>`}
      </section>
    </div>

    <section class="panel">
      <h3>Recent Sales</h3>
      ${sales.length === 0 ? `<p class="muted">Abhi tak koi sale nahi hui.</p>` : `
      <table class="mini-table">
        <thead><tr><th>Receipt</th><th>Date</th><th>Items</th><th>Total</th></tr></thead>
        <tbody>
          ${sales.slice(0, 8).map(s => `<tr>
            <td>${esc(s.receiptNo || s.id.slice(0, 6))}</td>
            <td>${fmtDate(s.date)}</td>
            <td>${s.items.reduce((a, i) => a + i.qty, 0)}</td>
            <td>${money(s.total)}</td>
          </tr>`).join("")}
        </tbody>
      </table>`}
    </section>
  `;
}

function statCard(icon, label, value, tone) {
  return `<div class="stat-card ${tone || ""}">
    <div class="stat-ic">${icon}</div>
    <div><div class="stat-value">${value}</div><div class="stat-label">${label}</div></div>
  </div>`;
}

/* ---------------------------------------------------------------------- */
/* POS / Sell                                                              */
/* ---------------------------------------------------------------------- */

async function renderPOS() {
  const products = await getProducts();
  const categories = Array.from(new Set(products.map(p => p.category).filter(Boolean)));

  $("#content").innerHTML = `
    <div class="pos-grid">
      <section class="panel pos-products">
        <div class="pos-search-row">
          <input type="text" id="posSearch" placeholder="🔍 Product ya SKU search karen..." class="input"/>
          <select id="posCategory" class="input input-sm">
            <option value="">All Categories</option>
            ${categories.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join("")}
          </select>
        </div>
        <div class="product-grid" id="posProductGrid"></div>
      </section>

      <section class="panel pos-cart">
        <h3>Cart</h3>
        <div id="cartItems" class="cart-items"></div>
        <div class="cart-summary" id="cartSummary"></div>
        <label class="mini-label">Customer (optional)</label>
        <input type="text" id="posCustomer" class="input" placeholder="Customer name"/>
        <label class="mini-label">Discount (${esc((window.CFG && CFG.currencySymbol) || "")})</label>
        <input type="number" id="posDiscount" class="input" value="0" min="0"/>
        <label class="mini-label">Payment Method</label>
        <select id="posPayment" class="input">
          <option>Cash</option><option>Card</option><option>Bank Transfer</option><option>Other</option>
        </select>
        <button class="btn btn-primary btn-block btn-lg" data-action="checkout">✅ Checkout &amp; Print Receipt</button>
        <button class="btn btn-ghost btn-block" data-action="clear-cart">Clear Cart</button>
      </section>
    </div>
  `;
  renderPosProductGrid(products);
  renderCart();

  $("#posSearch").addEventListener("input", filterPosProducts);
  $("#posCategory").addEventListener("change", filterPosProducts);
}

async function filterPosProducts() {
  const q = ($("#posSearch").value || "").toLowerCase();
  const cat = $("#posCategory").value;
  const products = await getProducts();
  const filtered = products.filter(p =>
    (!cat || p.category === cat) &&
    (!q || p.name.toLowerCase().includes(q) || (p.sku || "").toLowerCase().includes(q))
  );
  renderPosProductGrid(filtered);
}

function renderPosProductGrid(products) {
  const grid = $("#posProductGrid");
  if (!grid) return;
  if (products.length === 0) { grid.innerHTML = `<p class="muted">Koi product nahi mila.</p>`; return; }
  grid.innerHTML = products.map(p => `
    <button class="product-tile ${p.stock <= 0 ? "out" : ""}" data-action="add-to-cart" data-id="${p.id}" ${p.stock <= 0 ? "disabled" : ""}>
      <div class="pt-name">${esc(p.name)}</div>
      <div class="pt-price">${money(p.sellPrice)}</div>
      <div class="pt-stock">${p.stock <= 0 ? "Out of stock" : (p.stock + " " + esc(p.unit || "pcs") + " left")}</div>
    </button>
  `).join("");
}

function renderCart() {
  const box = $("#cartItems");
  if (!box) return;
  if (App.cart.length === 0) {
    box.innerHTML = `<p class="muted">Cart khali hai. Product par click karen.</p>`;
  } else {
    box.innerHTML = App.cart.map((it, idx) => `
      <div class="cart-row">
        <div class="cr-name">${esc(it.name)}<div class="cr-price">${money(it.price)} each</div></div>
        <div class="cr-qty">
          <button class="qty-btn" data-action="cart-dec" data-idx="${idx}">−</button>
          <span>${it.qty}</span>
          <button class="qty-btn" data-action="cart-inc" data-idx="${idx}">+</button>
        </div>
        <div class="cr-total">${money(it.price * it.qty)}</div>
        <button class="cr-remove" data-action="cart-remove" data-idx="${idx}">✕</button>
      </div>
    `).join("");
  }
  const subtotal = App.cart.reduce((a, it) => a + it.price * it.qty, 0);
  const discount = Number($("#posDiscount") ? $("#posDiscount").value : 0) || 0;
  const total = Math.max(0, subtotal - discount);
  $("#cartSummary").innerHTML = `
    <div class="sum-row"><span>Subtotal</span><span>${money(subtotal)}</span></div>
    <div class="sum-row"><span>Discount</span><span>-${money(discount)}</span></div>
    <div class="sum-row grand"><span>Total</span><span>${money(total)}</span></div>
  `;
}

async function addToCart(productId) {
  const products = await getProducts();
  const p = products.find(x => x.id === productId);
  if (!p || p.stock <= 0) return;
  const existing = App.cart.find(c => c.productId === productId);
  if (existing) {
    if (existing.qty >= p.stock) { toast("Stock khatam ho gaya hai.", "warn"); return; }
    existing.qty++;
  } else {
    App.cart.push({ productId: p.id, name: p.name, price: p.sellPrice, cost: p.costPrice || 0, qty: 1, stock: p.stock });
  }
  renderCart();
}

async function checkout() {
  if (App.cart.length === 0) { toast("Cart khali hai.", "warn"); return; }
  const products = await getProducts();
  const discount = Number($("#posDiscount").value) || 0;
  const subtotal = App.cart.reduce((a, it) => a + it.price * it.qty, 0);
  const total = Math.max(0, subtotal - discount);
  const sale = {
    id: uid(),
    receiptNo: "R" + Date.now().toString().slice(-8),
    items: App.cart.map(it => ({ productId: it.productId, name: it.name, qty: it.qty, price: it.price, cost: it.cost })),
    subtotal, discount, total,
    paymentMethod: $("#posPayment").value,
    customerName: $("#posCustomer").value || "",
    cashier: (App.user && (App.user.name || App.user.email)) || "",
    date: Date.now(),
  };
  // decrement stock
  for (const it of sale.items) {
    const p = products.find(x => x.id === it.productId);
    if (p) {
      p.stock = Math.max(0, (p.stock || 0) - it.qty);
      await DB.put("products", p);
    }
  }
  await DB.put("sales", sale);
  await logAudit("sale", `${sale.receiptNo} · ${money(sale.total)}`);
  toast("Sale mukammal ho gayi ✅", "ok");
  App.cart = [];
  window.Receipt && Receipt.print(sale);
  await renderPOS();
}

/* ---------------------------------------------------------------------- */
/* Purchase / Stock-In (wholesale)                                         */
/* ---------------------------------------------------------------------- */

App.purchaseCart = [];

async function renderPurchase() {
  const suppliers = await getSuppliers();
  const products = await getProducts();
  $("#content").innerHTML = `
    <div class="pos-grid">
      <section class="panel">
        <h3>Add Stock Item</h3>
        <label class="mini-label">Existing product (optional)</label>
        <select id="purchProduct" class="input">
          <option value="">— New product —</option>
          ${products.map(p => `<option value="${p.id}">${esc(p.name)} (stock: ${p.stock || 0})</option>`).join("")}
        </select>
        <div class="two-col">
          <div><label class="mini-label">Name</label><input id="purchName" class="input" placeholder="Product name"/></div>
          <div><label class="mini-label">Category</label><input id="purchCategory" class="input" placeholder="Toy / Cosmetic"/></div>
        </div>
        <div class="two-col">
          <div><label class="mini-label">Qty</label><input id="purchQty" type="number" class="input" value="1" min="1"/></div>
          <div><label class="mini-label">Wholesale Cost / unit</label><input id="purchCost" type="number" class="input" value="0" min="0"/></div>
        </div>
        <div class="two-col">
          <div><label class="mini-label">Sell Price / unit</label><input id="purchSell" type="number" class="input" value="0" min="0"/></div>
          <div><label class="mini-label">Unit</label><input id="purchUnit" class="input" placeholder="pcs" value="pcs"/></div>
        </div>
        <button class="btn btn-outline btn-block" data-action="add-purchase-item">➕ Add to Purchase List</button>
      </section>

      <section class="panel pos-cart">
        <h3>Purchase List</h3>
        <div id="purchItems" class="cart-items"></div>
        <div class="cart-summary" id="purchSummary"></div>
        <label class="mini-label">Supplier</label>
        <select id="purchSupplier" class="input">
          <option value="">— Walk-in / Unknown —</option>
          ${suppliers.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join("")}
        </select>
        <label class="mini-label">Note</label>
        <input id="purchNote" class="input" placeholder="e.g. Invoice #, notes"/>
        <button class="btn btn-primary btn-block btn-lg" data-action="save-purchase">💾 Save Stock-In</button>
        <button class="btn btn-ghost btn-block" data-action="clear-purchase">Clear</button>
      </section>
    </div>
  `;

  $("#purchProduct").addEventListener("change", (e) => {
    const p = products.find(x => x.id === e.target.value);
    if (p) {
      $("#purchName").value = p.name;
      $("#purchCategory").value = p.category || "";
      $("#purchCost").value = p.costPrice || 0;
      $("#purchSell").value = p.sellPrice || 0;
      $("#purchUnit").value = p.unit || "pcs";
    } else {
      $("#purchName").value = ""; $("#purchCategory").value = "";
      $("#purchCost").value = 0; $("#purchSell").value = 0; $("#purchUnit").value = "pcs";
    }
  });

  renderPurchaseList();
}

function renderPurchaseList() {
  const box = $("#purchItems");
  if (!box) return;
  if (App.purchaseCart.length === 0) {
    box.innerHTML = `<p class="muted">Abhi koi item add nahi hua.</p>`;
  } else {
    box.innerHTML = App.purchaseCart.map((it, idx) => `
      <div class="cart-row">
        <div class="cr-name">${esc(it.name)}<div class="cr-price">${it.qty} x ${money(it.cost)}</div></div>
        <div class="cr-total">${money(it.qty * it.cost)}</div>
        <button class="cr-remove" data-action="purchase-remove" data-idx="${idx}">✕</button>
      </div>
    `).join("");
  }
  const total = App.purchaseCart.reduce((a, it) => a + it.qty * it.cost, 0);
  $("#purchSummary").innerHTML = `<div class="sum-row grand"><span>Total Cost</span><span>${money(total)}</span></div>`;
}

function addPurchaseItem() {
  const productId = $("#purchProduct").value || null;
  const name = $("#purchName").value.trim();
  if (!name) { toast("Product ka naam likhen.", "warn"); return; }
  const qty = Number($("#purchQty").value) || 0;
  const cost = Number($("#purchCost").value) || 0;
  const sell = Number($("#purchSell").value) || 0;
  const category = $("#purchCategory").value.trim() || "General";
  const unit = $("#purchUnit").value.trim() || "pcs";
  if (qty <= 0) { toast("Qty 0 se zyada honi chahiye.", "warn"); return; }
  App.purchaseCart.push({ productId, name, category, qty, cost, sell, unit });
  renderPurchaseList();
  toast("Item list me add ho gaya.");
}

async function savePurchase() {
  if (App.purchaseCart.length === 0) { toast("List khali hai.", "warn"); return; }
  const suppliers = await getSuppliers();
  const supplierId = $("#purchSupplier").value || null;
  const supplier = suppliers.find(s => s.id === supplierId);
  const products = await getProducts();

  const items = [];
  for (const it of App.purchaseCart) {
    let product = it.productId ? products.find(p => p.id === it.productId) : products.find(p => p.name.toLowerCase() === it.name.toLowerCase());
    if (product) {
      product.stock = (product.stock || 0) + it.qty;
      product.costPrice = it.cost || product.costPrice;
      if (it.sell) product.sellPrice = it.sell;
      await DB.put("products", product);
    } else {
      product = {
        id: uid(), name: it.name, category: it.category, sku: "",
        costPrice: it.cost, sellPrice: it.sell || it.cost, stock: it.qty,
        unit: it.unit, lowStockAt: (window.CFG && CFG.defaultLowStockThreshold) || 5
      };
      await DB.put("products", product);
    }
    items.push({ productId: product.id, name: product.name, qty: it.qty, cost: it.cost });
  }

  const total = items.reduce((a, it) => a + it.qty * it.cost, 0);
  const po = {
    id: uid(), supplierId, supplierName: supplier ? supplier.name : "Walk-in / Unknown",
    items, total, note: $("#purchNote").value || "", date: Date.now()
  };
  await DB.put("purchaseOrders", po);
  await logAudit("stock-in", `${po.supplierName} · ${money(po.total)}`);
  toast("Stock-in save ho gaya ✅", "ok");
  App.purchaseCart = [];
  await renderPurchase();
}

/* ---------------------------------------------------------------------- */
/* Products                                                                 */
/* ---------------------------------------------------------------------- */

async function renderProducts() {
  const products = await getProducts();
  const categories = Array.from(new Set(products.map(p => p.category).filter(Boolean)));
  $("#content").innerHTML = `
    <section class="panel">
      <div class="panel-header">
        <h3>Products (${products.length})</h3>
        <button class="btn btn-primary" data-action="new-product">➕ Add Product</button>
      </div>
      <div class="pos-search-row">
        <input type="text" id="prodSearch" class="input" placeholder="🔍 Search products..."/>
        <select id="prodCategory" class="input input-sm">
          <option value="">All Categories</option>
          ${categories.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join("")}
        </select>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Name</th><th>Category</th><th>SKU</th><th>Cost</th><th>Sell</th><th>Stock</th><th></th></tr></thead>
          <tbody id="prodTableBody"></tbody>
        </table>
      </div>
    </section>
  `;
  function draw() {
    const q = ($("#prodSearch").value || "").toLowerCase();
    const cat = $("#prodCategory").value;
    const filtered = products.filter(p => (!cat || p.category === cat) && (!q || p.name.toLowerCase().includes(q) || (p.sku || "").toLowerCase().includes(q)));
    $("#prodTableBody").innerHTML = filtered.map(p => `
      <tr class="${(p.stock || 0) <= lowStockThreshold(p) ? "row-warn" : ""}">
        <td>${esc(p.name)}</td>
        <td>${esc(p.category || "")}</td>
        <td>${esc(p.sku || "—")}</td>
        <td>${money(p.costPrice)}</td>
        <td>${money(p.sellPrice)}</td>
        <td>${p.stock || 0} ${esc(p.unit || "")}</td>
        <td class="row-actions">
          <button class="icon-btn" data-action="edit-product" data-id="${p.id}">✏️</button>
          <button class="icon-btn" data-action="delete-product" data-id="${p.id}">🗑</button>
        </td>
      </tr>
    `).join("") || `<tr><td colspan="7" class="muted">Koi product nahi mila.</td></tr>`;
  }
  draw();
  $("#prodSearch").addEventListener("input", draw);
  $("#prodCategory").addEventListener("change", draw);
}

function productFormModal(product) {
  const p = product || { name: "", category: "", sku: "", costPrice: 0, sellPrice: 0, stock: 0, unit: "pcs", lowStockAt: (window.CFG && CFG.defaultLowStockThreshold) || 5 };
  openModal(`
    <h3>${product ? "Edit" : "Add"} Product</h3>
    <form id="productForm">
      <input type="hidden" name="id" value="${p.id || ""}"/>
      <label class="mini-label">Name</label>
      <input class="input" name="name" required value="${esc(p.name)}"/>
      <div class="two-col">
        <div><label class="mini-label">Category</label><input class="input" name="category" value="${esc(p.category)}" placeholder="Toy / Cosmetic"/></div>
        <div><label class="mini-label">SKU / Barcode</label><input class="input" name="sku" value="${esc(p.sku || "")}"/></div>
      </div>
      <div class="two-col">
        <div><label class="mini-label">Cost Price (wholesale)</label><input class="input" type="number" name="costPrice" value="${p.costPrice}" min="0"/></div>
        <div><label class="mini-label">Sell Price (retail)</label><input class="input" type="number" name="sellPrice" value="${p.sellPrice}" min="0"/></div>
      </div>
      <div class="two-col">
        <div><label class="mini-label">Stock Qty</label><input class="input" type="number" name="stock" value="${p.stock}" min="0"/></div>
        <div><label class="mini-label">Unit</label><input class="input" name="unit" value="${esc(p.unit || "pcs")}"/></div>
      </div>
      <label class="mini-label">Low stock alert at</label>
      <input class="input" type="number" name="lowStockAt" value="${p.lowStockAt}" min="0"/>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" data-action="close-modal">Cancel</button>
        <button type="submit" class="btn btn-primary">Save</button>
      </div>
    </form>
  `);
}

async function saveProductForm(form) {
  const fd = new FormData(form);
  const id = fd.get("id");
  const p = {
    id: id || uid(),
    name: fd.get("name").trim(),
    category: fd.get("category").trim() || "General",
    sku: fd.get("sku").trim(),
    costPrice: Number(fd.get("costPrice")) || 0,
    sellPrice: Number(fd.get("sellPrice")) || 0,
    stock: Number(fd.get("stock")) || 0,
    unit: fd.get("unit").trim() || "pcs",
    lowStockAt: Number(fd.get("lowStockAt")) || 0,
  };
  await DB.put("products", p);
  await logAudit(id ? "product-edit" : "product-add", p.name);
  closeModal();
  toast("Product save ho gaya.", "ok");
  await renderProducts();
}

/* ---------------------------------------------------------------------- */
/* Suppliers / Customers / Expenses — simple CRUD lists                    */
/* ---------------------------------------------------------------------- */

async function renderSuppliers() {
  const rows = await getSuppliers();
  $("#content").innerHTML = simpleCrudPanel("Suppliers", rows, [
    ["name", "Name"], ["phone", "Phone"], ["address", "Address"]
  ], "supplier");
}
async function renderCustomers() {
  const rows = await getCustomers();
  $("#content").innerHTML = simpleCrudPanel("Customers", rows, [
    ["name", "Name"], ["phone", "Phone"]
  ], "customer");
}
async function renderExpenses() {
  const rows = await getExpenses();
  const total = rows.reduce((a, e) => a + Number(e.amount || 0), 0);
  $("#content").innerHTML = `
    <section class="panel">
      <div class="panel-header"><h3>Expenses — Total: ${money(total)}</h3>
        <button class="btn btn-primary" data-action="new-expense">➕ Add Expense</button>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Title</th><th>Category</th><th>Amount</th><th>Date</th><th></th></tr></thead>
          <tbody>
            ${rows.map(e => `<tr>
              <td>${esc(e.title)}</td><td>${esc(e.category || "")}</td><td>${money(e.amount)}</td><td>${fmtDateOnly(e.date)}</td>
              <td class="row-actions"><button class="icon-btn" data-action="delete-expense" data-id="${e.id}">🗑</button></td>
            </tr>`).join("") || `<tr><td colspan="5" class="muted">Koi expense nahi.</td></tr>`}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function simpleCrudPanel(title, rows, fields, kind) {
  return `
    <section class="panel">
      <div class="panel-header"><h3>${title} (${rows.length})</h3>
        <button class="btn btn-primary" data-action="new-${kind}">➕ Add ${title.slice(0, -1)}</button>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr>${fields.map(f => `<th>${f[1]}</th>`).join("")}<th></th></tr></thead>
          <tbody>
            ${rows.map(r => `<tr>
              ${fields.map(f => `<td>${esc(r[f[0]] || "")}</td>`).join("")}
              <td class="row-actions">
                <button class="icon-btn" data-action="edit-${kind}" data-id="${r.id}">✏️</button>
                <button class="icon-btn" data-action="delete-${kind}" data-id="${r.id}">🗑</button>
              </td>
            </tr>`).join("") || `<tr><td colspan="${fields.length + 1}" class="muted">Koi record nahi.</td></tr>`}
          </tbody>
        </table>
      </div>
    </section>`;
}

function supplierFormModal(rec) {
  const r = rec || { name: "", phone: "", address: "" };
  openModal(`
    <h3>${rec ? "Edit" : "Add"} Supplier</h3>
    <form id="supplierForm">
      <input type="hidden" name="id" value="${r.id || ""}"/>
      <label class="mini-label">Name</label><input class="input" name="name" required value="${esc(r.name)}"/>
      <label class="mini-label">Phone</label><input class="input" name="phone" value="${esc(r.phone || "")}"/>
      <label class="mini-label">Address</label><input class="input" name="address" value="${esc(r.address || "")}"/>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" data-action="close-modal">Cancel</button>
        <button type="submit" class="btn btn-primary">Save</button>
      </div>
    </form>`);
}
function customerFormModal(rec) {
  const r = rec || { name: "", phone: "" };
  openModal(`
    <h3>${rec ? "Edit" : "Add"} Customer</h3>
    <form id="customerForm">
      <input type="hidden" name="id" value="${r.id || ""}"/>
      <label class="mini-label">Name</label><input class="input" name="name" required value="${esc(r.name)}"/>
      <label class="mini-label">Phone</label><input class="input" name="phone" value="${esc(r.phone || "")}"/>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" data-action="close-modal">Cancel</button>
        <button type="submit" class="btn btn-primary">Save</button>
      </div>
    </form>`);
}
function expenseFormModal() {
  openModal(`
    <h3>Add Expense</h3>
    <form id="expenseForm">
      <label class="mini-label">Title</label><input class="input" name="title" required placeholder="e.g. Shop Rent"/>
      <label class="mini-label">Category</label><input class="input" name="category" placeholder="Rent / Bills / Salary / Other"/>
      <label class="mini-label">Amount</label><input class="input" type="number" name="amount" min="0" required/>
      <label class="mini-label">Date</label><input class="input" type="date" name="date" value="${new Date().toISOString().slice(0, 10)}"/>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" data-action="close-modal">Cancel</button>
        <button type="submit" class="btn btn-primary">Save</button>
      </div>
    </form>`);
}

/* ---------------------------------------------------------------------- */
/* Reports                                                                  */
/* ---------------------------------------------------------------------- */

async function renderReports() {
  const r = await computeReport();
  $("#content").innerHTML = `
    <section class="panel">
      <div class="panel-header">
        <h3>Profit &amp; Loss</h3>
        <div class="range-tabs">
          ${["today", "week", "month", "custom"].map(k => `<button class="chip ${App.reportRange === k ? "active" : ""}" data-action="set-range" data-range="${k}">${k[0].toUpperCase() + k.slice(1)}</button>`).join("")}
        </div>
      </div>
      ${App.reportRange === "custom" ? `
        <div class="two-col">
          <div><label class="mini-label">From</label><input type="date" id="rangeFrom" class="input" value="${App.reportFrom || ""}"/></div>
          <div><label class="mini-label">To</label><input type="date" id="rangeTo" class="input" value="${App.reportTo || ""}"/></div>
        </div>
        <button class="btn btn-outline" data-action="apply-range">Apply</button>
      ` : ""}
      <div class="cards-grid" style="margin-top:16px">
        ${statCard("💰", "Revenue", money(r.revenue), "")}
        ${statCard("📉", "Cost of Goods Sold", money(r.cogs), "")}
        ${statCard("🧮", "Gross Profit", money(r.grossProfit), r.grossProfit >= 0 ? "good" : "bad")}
        ${statCard("💸", "Expenses", money(r.expenseTotal), "")}
        ${statCard("✅", "Net Profit", money(r.netProfit), r.netProfit >= 0 ? "good" : "bad")}
        ${statCard("🎟", "Discounts Given", money(r.discountTotal), "")}
      </div>
    </section>

    <div class="panel-grid">
      <section class="panel">
        <h3>Top Selling Products</h3>
        ${r.topSelling.length === 0 ? `<p class="muted">Koi data nahi.</p>` : `
        <table class="mini-table"><thead><tr><th>Product</th><th>Qty Sold</th></tr></thead>
        <tbody>${r.topSelling.map(([name, qty]) => `<tr><td>${esc(name)}</td><td>${qty}</td></tr>`).join("")}</tbody></table>`}
      </section>
      <section class="panel">
        <h3>Stock Valuation</h3>
        <div class="sum-row"><span>At cost price</span><span>${money(r.stockCostValue)}</span></div>
        <div class="sum-row"><span>At retail price</span><span>${money(r.stockRetailValue)}</span></div>
        <div class="sum-row grand"><span>Potential profit if all sold</span><span>${money(r.stockRetailValue - r.stockCostValue)}</span></div>
      </section>
    </div>

    <section class="panel">
      <div class="panel-header">
        <h3>Sales in Range (${r.sales.length})</h3>
        <button class="btn btn-outline" data-action="export-sales-csv">⬇ Export CSV</button>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Receipt</th><th>Date</th><th>Customer</th><th>Items</th><th>Total</th><th></th></tr></thead>
          <tbody>
            ${r.sales.map(s => `<tr>
              <td>${esc(s.receiptNo || s.id.slice(0, 6))}</td>
              <td>${fmtDate(s.date)}</td>
              <td>${esc(s.customerName || "—")}</td>
              <td>${s.items.reduce((a, i) => a + i.qty, 0)}</td>
              <td>${money(s.total)}</td>
              <td class="row-actions">
                <button class="icon-btn" data-action="reprint-sale" data-id="${s.id}">🖨</button>
                <button class="icon-btn" data-action="return-sale" data-id="${s.id}">↩</button>
              </td>
            </tr>`).join("") || `<tr><td colspan="6" class="muted">Is range me koi sale nahi.</td></tr>`}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

async function exportSalesCsv() {
  const r = await computeReport();
  const lines = [["Receipt", "Date", "Customer", "Items", "Subtotal", "Discount", "Total"].join(",")];
  for (const s of r.sales) {
    lines.push([
      s.receiptNo, new Date(s.date).toISOString(), (s.customerName || "").replace(/,/g, " "),
      s.items.reduce((a, i) => a + i.qty, 0), s.subtotal, s.discount, s.total
    ].join(","));
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "sales-export.csv";
  a.click();
}

async function returnSale(id) {
  if (!confirm("Ye poori sale return / cancel karni hai? Stock wapas add ho jayega.")) return;
  const sale = await DB.get("sales", id);
  if (!sale || sale.returned) return;
  const products = await getProducts();
  for (const it of sale.items) {
    const p = products.find(x => x.id === it.productId);
    if (p) { p.stock = (p.stock || 0) + it.qty; await DB.put("products", p); }
  }
  sale.returned = true;
  await DB.put("sales", sale);
  await DB.put("returns", { id: uid(), saleId: sale.id, items: sale.items, amount: sale.total, date: Date.now() });
  await logAudit("return", sale.receiptNo);
  toast("Sale return ho gayi, stock update ho gaya.", "ok");
  await renderReports();
}

/* ---------------------------------------------------------------------- */
/* Settings                                                                  */
/* ---------------------------------------------------------------------- */

async function renderSettings() {
  const cfg = window.CFG || {};
  const syncOn = window.SMSync && SMSync.isConfigured();
  const queue = await DB.getSyncQueue();
  $("#content").innerHTML = `
    <div class="panel-grid">
      <section class="panel">
        <h3>Shop</h3>
        <p><b>Name:</b> ${esc(cfg.shopName)}</p>
        <p><b>Tagline:</b> ${esc(cfg.shopTagline || "")}</p>
        <p class="muted">Shop name / logo edit karne ke liye <code>js/config.js</code> file kholen.</p>
      </section>

      <section class="panel">
        <h3>Cloud Sync</h3>
        <p><b>Status:</b> ${syncOn ? "✅ Connected to Firebase" : "⚪ Offline (Firebase not configured)"}</p>
        <p><b>Pending changes not yet synced:</b> ${queue.length}</p>
        ${syncOn ? `
          <button class="btn btn-primary" data-action="sync-now">🔄 Sync Now</button>
          <button class="btn btn-outline" data-action="full-resync">⏫ Full Resync (push + pull)</button>
        ` : `<p class="muted">Firebase config add karne ke baad ye options yahan active ho jayenge. Dekhen <code>js/config.js</code>.</p>`}
      </section>

      <section class="panel">
        <h3>Backup</h3>
        <button class="btn btn-outline btn-block" data-action="export-backup">⬇ Download Backup (JSON)</button>
        <label class="btn btn-outline btn-block" style="text-align:center;cursor:pointer;">
          ⬆ Restore from Backup
          <input type="file" id="restoreFile" accept="application/json" style="display:none"/>
        </label>
      </section>

      <section class="panel">
        <h3>Printer</h3>
        <p class="muted">Receipt paper width: <b>${esc(cfg.receiptPaperWidth || "80mm")}</b> (change in config.js)</p>
        <button class="btn btn-outline" data-action="test-print">🖨 Test Print</button>
      </section>

      <section class="panel">
        <h3>Install App</h3>
        <p class="muted">Browser menu me "Add to Home Screen" / "Install App" option se ye software app ki tarah phone ya PC par install ho sakta hai.</p>
        <button class="btn btn-outline" id="installBtn" style="display:none">📲 Install App</button>
      </section>
    </div>
  `;
  $("#restoreFile").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    try {
      const payload = JSON.parse(text);
      await DB.importAll(payload);
      toast("Backup restore ho gaya ✅", "ok");
      render();
    } catch (err) { toast("Invalid backup file.", "bad"); }
  });
  if (window.deferredInstallPrompt) {
    const btn = $("#installBtn");
    btn.style.display = "inline-flex";
    btn.addEventListener("click", async () => {
      window.deferredInstallPrompt.prompt();
      await window.deferredInstallPrompt.userChoice;
      window.deferredInstallPrompt = null;
    });
  }
}

async function exportBackup() {
  const payload = await DB.exportAll();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `shop-backup-${todayKey(Date.now())}.json`;
  a.click();
}

/* ---------------------------------------------------------------------- */
/* Event delegation                                                        */
/* ---------------------------------------------------------------------- */

document.addEventListener("click", async (e) => {
  const el = e.target.closest("[data-action]");
  if (!el) return;
  const action = el.dataset.action;
  const id = el.dataset.id;

  switch (action) {
    case "toggle-pass": {
      const inp = $("#loginPass");
      inp.type = inp.type === "password" ? "text" : "password";
      break;
    }
    case "show-signup": $("#loginForm").classList.add("hidden"); $("#signupForm").classList.remove("hidden"); break;
    case "show-login": $("#signupForm").classList.add("hidden"); $("#loginForm").classList.remove("hidden"); break;
    case "forgot": e.preventDefault(); toast("Password reset ke liye shop admin se rabta karen.", "warn"); break;

    case "logout":
      if (window.SMSync && SMSync.currentUser()) await SMSync.signOut();
      App.user = null;
      await DB.setMeta("session", null);
      render();
      break;

    case "sync-now":
      if (window.SMSync && SMSync.isReady()) { toast("Sync ho raha hai..."); await SMSync.flushQueue(); await SMSync.pullAll(); toast("Sync mukammal ✅", "ok"); render(); }
      else toast("Cloud sync configure nahi hai.", "warn");
      break;
    case "full-resync":
      if (window.SMSync && SMSync.isReady()) { toast("Full resync ho raha hai..."); await SMSync.fullResync(); toast("Resync mukammal ✅", "ok"); render(); }
      break;

    case "toggle-sidebar": document.querySelector(".sidebar").classList.toggle("open"); break;

    // POS
    case "add-to-cart": await addToCart(id); break;
    case "cart-inc": App.cart[el.dataset.idx].qty++; renderCart(); break;
    case "cart-dec": {
      const it = App.cart[el.dataset.idx];
      it.qty--; if (it.qty <= 0) App.cart.splice(el.dataset.idx, 1);
      renderCart(); break;
    }
    case "cart-remove": App.cart.splice(el.dataset.idx, 1); renderCart(); break;
    case "clear-cart": App.cart = []; renderCart(); break;
    case "checkout": await checkout(); break;

    // Purchase
    case "add-purchase-item": addPurchaseItem(); break;
    case "purchase-remove": App.purchaseCart.splice(el.dataset.idx, 1); renderPurchaseList(); break;
    case "clear-purchase": App.purchaseCart = []; renderPurchaseList(); break;
    case "save-purchase": await savePurchase(); break;

    // Products
    case "new-product": productFormModal(null); break;
    case "edit-product": productFormModal(await DB.get("products", id)); break;
    case "delete-product": if (confirm("Ye product delete karna hai?")) { await DB.remove("products", id); toast("Product delete ho gaya."); renderProducts(); } break;

    // Suppliers
    case "new-supplier": supplierFormModal(null); break;
    case "edit-supplier": supplierFormModal(await DB.get("suppliers", id)); break;
    case "delete-supplier": if (confirm("Supplier delete karna hai?")) { await DB.remove("suppliers", id); renderSuppliers(); } break;

    // Customers
    case "new-customer": customerFormModal(null); break;
    case "edit-customer": customerFormModal(await DB.get("customers", id)); break;
    case "delete-customer": if (confirm("Customer delete karna hai?")) { await DB.remove("customers", id); renderCustomers(); } break;

    // Expenses
    case "new-expense": expenseFormModal(); break;
    case "delete-expense": if (confirm("Expense delete karna hai?")) { await DB.remove("expenses", id); renderExpenses(); } break;

    // Reports
    case "set-range": App.reportRange = el.dataset.range; renderReports(); break;
    case "apply-range": App.reportFrom = $("#rangeFrom").value; App.reportTo = $("#rangeTo").value; renderReports(); break;
    case "export-sales-csv": await exportSalesCsv(); break;
    case "reprint-sale": { const s = await DB.get("sales", id); if (s) Receipt.print(s); break; }
    case "return-sale": await returnSale(id); break;

    // Settings
    case "export-backup": await exportBackup(); break;
    case "test-print": Receipt.print({ id: "TEST", receiptNo: "TEST-0001", items: [{ name: "Sample Item", qty: 1, price: 100 }], subtotal: 100, discount: 0, total: 100, paymentMethod: "Cash", date: Date.now() }); break;

    case "close-modal": closeModal(); break;
  }
});

document.addEventListener("submit", async (e) => {
  const form = e.target;
  if (form.id === "loginForm") {
    e.preventDefault();
    const fd = new FormData(form);
    const email = fd.get("email").trim();
    const password = fd.get("password");
    const btn = $("#loginBtn");
    btn.disabled = true; btn.textContent = "Signing in...";
    try {
      let user;
      if (window.SMSync && SMSync.isConfigured()) {
        user = await SMSync.signIn(email, password);
        user = { email: user.email, uid: user.uid };
      } else {
        user = await localSignIn(email, password);
      }
      App.user = user;
      await DB.setMeta("session", user);
      toast("Khush aamdeed! 🎉", "ok");
      location.hash = "#/dashboard";
      render();
    } catch (err) {
      toast(err.message || "Login fail ho gaya.", "bad");
    } finally {
      btn.disabled = false; btn.textContent = "↪  Login";
    }
  }

  if (form.id === "signupForm") {
    e.preventDefault();
    const fd = new FormData(form);
    const email = fd.get("email").trim();
    const password = fd.get("password");
    const name = fd.get("name").trim();
    try {
      let user;
      if (window.SMSync && SMSync.isConfigured()) {
        user = await SMSync.signUp(email, password);
        user = { email: user.email, uid: user.uid, name };
      } else {
        user = await localSignUp(email, password, name);
      }
      App.user = user;
      await DB.setMeta("session", user);
      toast("Account ban gaya, khush aamdeed! 🎉", "ok");
      location.hash = "#/dashboard";
      render();
    } catch (err) {
      toast(err.message || "Signup fail ho gaya.", "bad");
    }
  }

  if (form.id === "productForm") { e.preventDefault(); await saveProductForm(form); }

  if (form.id === "supplierForm") {
    e.preventDefault();
    const fd = new FormData(form);
    await DB.put("suppliers", { id: fd.get("id") || uid(), name: fd.get("name").trim(), phone: fd.get("phone").trim(), address: fd.get("address").trim() });
    closeModal(); toast("Supplier save ho gaya."); renderSuppliers();
  }

  if (form.id === "customerForm") {
    e.preventDefault();
    const fd = new FormData(form);
    await DB.put("customers", { id: fd.get("id") || uid(), name: fd.get("name").trim(), phone: fd.get("phone").trim() });
    closeModal(); toast("Customer save ho gaya."); renderCustomers();
  }

  if (form.id === "expenseForm") {
    e.preventDefault();
    const fd = new FormData(form);
    await DB.put("expenses", {
      id: uid(), title: fd.get("title").trim(), category: fd.get("category").trim(),
      amount: Number(fd.get("amount")) || 0, date: new Date(fd.get("date")).getTime() || Date.now()
    });
    closeModal(); toast("Expense save ho gaya."); renderExpenses();
  }
});

document.addEventListener("input", (e) => {
  if (e.target.id === "posDiscount") renderCart();
});

window.addEventListener("hashchange", render);

let _syncRenderTimer = null;
window.addEventListener("sm:synced", () => {
  if (!App.user) return;
  clearTimeout(_syncRenderTimer);
  _syncRenderTimer = setTimeout(() => {
    const route = (location.hash.replace("#/", "") || "dashboard").split("?")[0];
    const modalOpen = !!document.getElementById("modalOverlay");
    const typing = document.activeElement && ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName);
    const midTask = route === "pos" || route === "purchase";
    // Don't yank the screen while someone is filling a cart, a form, or has a
    // modal open — incoming cloud data will simply show up next time they
    // navigate or once they're done. Anywhere else, a quiet refresh is safe.
    if (modalOpen || typing || midTask) return;
    render();
  }, 1200);
});

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  window.deferredInstallPrompt = e;
});

/* ---------------------------------------------------------------------- */
/* Boot                                                                     */
/* ---------------------------------------------------------------------- */

async function boot() {
  await ensureLocalAdmin();
  const session = await DB.getMeta("session");
  if (session) App.user = session;

  if (!location.hash) location.hash = "#/dashboard";
  render();
}

boot();
