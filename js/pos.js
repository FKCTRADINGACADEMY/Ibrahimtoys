// ============================================================
// POS / BILLING — cart, checkout, invoice generation & printing,
// sales history, and dashboard sales stats.
// Stock deduction + sale record are written together in one
// Firestore batch, which is queued automatically while offline
// and synced when the connection returns (same as inventory.js).
// ============================================================

let cart = []; // { productId, name, sku, category, price, cost, qty, stock }
let billCategory = "All";
let billSearchTerm = "";
let allSales = [];
let salesDateFilter = "";
let salesSearchTerm = "";

// ---------- Helpers ----------
function money(n) {
  return "Rs. " + Number(n || 0).toLocaleString("en-PK", { maximumFractionDigits: 0 });
}

function generateInvoiceNo() {
  const now = new Date();
  const p = (n, len = 2) => String(n).padStart(len, "0");
  const rand = Math.floor(100 + Math.random() * 900);
  return `INV-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}-${rand}`;
}

function fmtDate(ts) {
  if (!ts) return "—";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString("en-PK", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function isSameDay(ts, dateStr) {
  if (!ts) return false;
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const target = dateStr ? new Date(dateStr) : new Date();
  return d.getFullYear() === target.getFullYear() && d.getMonth() === target.getMonth() && d.getDate() === target.getDate();
}

// ============================================================
// BILLING SCREEN — product picker
// ============================================================
function renderPosProductGrid() {
  const grid = document.getElementById("posProductGrid");
  if (!grid) return;

  const filtered = (allProducts || []).filter((p) => {
    const matchesCat = billCategory === "All" || p.category === billCategory;
    const matchesSearch =
      !billSearchTerm ||
      p.name.toLowerCase().includes(billSearchTerm) ||
      (p.sku || "").toLowerCase().includes(billSearchTerm);
    return matchesCat && matchesSearch;
  });

  if (filtered.length === 0) {
    grid.innerHTML = '<div class="empty-state" style="grid-column: 1 / -1;"><h4>Koi product nahi mila</h4><p>Search ya filter badal kar dekhein.</p></div>';
    return;
  }

  grid.innerHTML = filtered
    .map((p) => {
      const stock = Number(p.stock);
      const out = stock <= 0;
      return `
      <div class="product-card pos-card ${out ? "out-of-stock" : ""}" data-add="${p.id}">
        <span class="cat-tag ${escapeHtml(p.category)}">${escapeHtml(p.category)}</span>
        <div>
          <div class="p-name">${escapeHtml(p.name)}</div>
          <div class="p-sku">SKU: ${escapeHtml(p.sku || "—")} · ${stock} in stock</div>
        </div>
        <div class="p-price-row">
          <span class="p-price">${money(p.price)}</span>
        </div>
        <button class="btn btn-primary btn-sm" style="justify-content:center;" ${out ? "disabled" : ""}>${out ? "Out of stock" : "+ Add to Cart"}</button>
      </div>`;
    })
    .join("");

  grid.querySelectorAll("[data-add]").forEach((el) => {
    el.addEventListener("click", () => addToCart(el.dataset.add));
  });
}

document.querySelectorAll("#billFilterChips .chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    document.querySelectorAll("#billFilterChips .chip").forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    billCategory = chip.dataset.cat;
    renderPosProductGrid();
  });
});

document.getElementById("billSearchInput")?.addEventListener("input", (e) => {
  billSearchTerm = e.target.value.trim().toLowerCase();
  renderPosProductGrid();
});

// ============================================================
// CART
// ============================================================
function addToCart(productId) {
  const p = allProducts.find((x) => x.id === productId);
  if (!p) return;
  if (Number(p.stock) <= 0) {
    showToast("Ye item stock mein nahi hai.");
    return;
  }
  const existing = cart.find((c) => c.productId === productId);
  if (existing) {
    if (existing.qty >= Number(p.stock)) {
      showToast("Available stock se zyada add nahi kar sakte.");
      return;
    }
    existing.qty += 1;
  } else {
    cart.push({
      productId: p.id,
      name: p.name,
      sku: p.sku || "",
      category: p.category,
      price: Number(p.price),
      cost: Number(p.cost || 0),
      qty: 1,
      stock: Number(p.stock),
    });
  }
  renderCart();
}

function changeQty(productId, delta) {
  const item = cart.find((c) => c.productId === productId);
  if (!item) return;
  const newQty = item.qty + delta;
  if (newQty <= 0) {
    cart = cart.filter((c) => c.productId !== productId);
  } else if (newQty > item.stock) {
    showToast("Available stock se zyada add nahi kar sakte.");
    return;
  } else {
    item.qty = newQty;
  }
  renderCart();
}

function removeFromCart(productId) {
  cart = cart.filter((c) => c.productId !== productId);
  renderCart();
}

function renderCart() {
  const wrap = document.getElementById("cartItemsList");
  if (!wrap) return;

  if (cart.length === 0) {
    wrap.innerHTML = '<div class="empty-state" style="padding:36px 16px;"><h4>Cart khali hai</h4><p>Bayen taraf se products select karein.</p></div>';
  } else {
    wrap.innerHTML = cart
      .map(
        (c) => `
      <div class="cart-item">
        <div class="cart-item-info">
          <div class="cart-item-name">${escapeHtml(c.name)}</div>
          <div class="cart-item-price">${money(c.price)} x ${c.qty} = ${money(c.price * c.qty)}</div>
        </div>
        <div class="cart-item-qty">
          <button class="qty-btn" data-qty-minus="${c.productId}">−</button>
          <span>${c.qty}</span>
          <button class="qty-btn" data-qty-plus="${c.productId}">+</button>
        </div>
        <button class="icon-btn cart-remove" data-remove="${c.productId}" title="Remove">✕</button>
      </div>`
      )
      .join("");

    wrap.querySelectorAll("[data-qty-plus]").forEach((b) => b.addEventListener("click", () => changeQty(b.dataset.qtyPlus, 1)));
    wrap.querySelectorAll("[data-qty-minus]").forEach((b) => b.addEventListener("click", () => changeQty(b.dataset.qtyMinus, -1)));
    wrap.querySelectorAll("[data-remove]").forEach((b) => b.addEventListener("click", () => removeFromCart(b.dataset.remove)));
  }

  renderCartSummary();
}

function renderCartSummary() {
  const subtotal = cart.reduce((sum, c) => sum + c.price * c.qty, 0);
  const discount = Math.min(Number(document.getElementById("discountInput")?.value || 0), subtotal);
  const total = Math.max(0, subtotal - discount);

  document.getElementById("cartSubtotal").textContent = money(subtotal);
  document.getElementById("cartDiscount").textContent = money(discount);
  document.getElementById("cartTotal").textContent = money(total);
}

document.getElementById("discountInput")?.addEventListener("input", renderCartSummary);

document.getElementById("clearCartBtn")?.addEventListener("click", () => {
  if (cart.length === 0) return;
  if (!confirm("Poora cart clear karna hai?")) return;
  cart = [];
  document.getElementById("custName").value = "";
  document.getElementById("custPhone").value = "";
  document.getElementById("discountInput").value = 0;
  renderCart();
});

// ============================================================
// CHECKOUT — batch write: create sale + decrement stock
// ============================================================
document.getElementById("checkoutBtn")?.addEventListener("click", async () => {
  if (cart.length === 0) {
    showToast("Cart khali hai — pehle products add karein.");
    return;
  }

  const btn = document.getElementById("checkoutBtn");
  btn.disabled = true;
  btn.textContent = "Processing...";

  try {
    const subtotal = cart.reduce((sum, c) => sum + c.price * c.qty, 0);
    const discount = Math.min(Number(document.getElementById("discountInput").value || 0), subtotal);
    const total = Math.max(0, subtotal - discount);
    const profit = cart.reduce((sum, c) => sum + (c.price - c.cost) * c.qty, 0) - discount;

    const sale = {
      invoiceNo: generateInvoiceNo(),
      items: cart.map((c) => ({
        productId: c.productId,
        name: c.name,
        sku: c.sku,
        category: c.category,
        price: c.price,
        cost: c.cost,
        qty: c.qty,
        lineTotal: c.price * c.qty,
      })),
      subtotal,
      discount,
      total,
      profit,
      customerName: document.getElementById("custName").value.trim() || "Walk-in Customer",
      customerPhone: document.getElementById("custPhone").value.trim(),
      paymentMethod: document.getElementById("paymentMethod").value,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdByEmail: (auth.currentUser && auth.currentUser.email) || "",
    };

    const batch = db.batch();
    const saleRef = db.collection(SALES_COLLECTION).doc();
    batch.set(saleRef, sale);
    cart.forEach((c) => {
      const productRef = db.collection(PRODUCTS_COLLECTION).doc(c.productId);
      batch.update(productRef, { stock: firebase.firestore.FieldValue.increment(-c.qty) });
    });
    await batch.commit();

    showToast("Sale complete ho gayi" + (navigator.onLine ? "." : " — offline, sync hoga jab internet aayega."));

    // Show + print invoice using local timestamp (serverTimestamp resolves later)
    openInvoiceModal({ ...sale, createdAt: new Date() }, true);

    cart = [];
    document.getElementById("custName").value = "";
    document.getElementById("custPhone").value = "";
    document.getElementById("discountInput").value = 0;
    renderCart();
  } catch (err) {
    console.error(err);
    showToast("Sale complete karne mein masla hua.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Complete Sale & Print Invoice";
  }
});

// ============================================================
// INVOICE PREVIEW + PRINT
// ============================================================
function invoiceHtml(sale) {
  const rows = sale.items
    .map(
      (it) => `
    <tr>
      <td>${escapeHtml(it.name)}</td>
      <td>${it.qty}</td>
      <td>${money(it.price)}</td>
      <td>${money(it.lineTotal)}</td>
    </tr>`
    )
    .join("");

  return `
    <div class="invoice-doc">
      <div class="invoice-head">
        <h2>Ibrahim Toys &amp; Cosmetics</h2>
        <p>Invoice</p>
      </div>
      <div class="invoice-meta">
        <div><strong>Invoice #:</strong> ${escapeHtml(sale.invoiceNo)}</div>
        <div><strong>Date:</strong> ${fmtDate(sale.createdAt)}</div>
        <div><strong>Customer:</strong> ${escapeHtml(sale.customerName || "Walk-in Customer")}</div>
        ${sale.customerPhone ? `<div><strong>Phone:</strong> ${escapeHtml(sale.customerPhone)}</div>` : ""}
        <div><strong>Payment:</strong> ${escapeHtml(sale.paymentMethod)}</div>
      </div>
      <table class="invoice-table">
        <thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="invoice-totals">
        <div><span>Subtotal</span><span>${money(sale.subtotal)}</span></div>
        <div><span>Discount</span><span>${money(sale.discount)}</span></div>
        <div class="grand"><span>Total</span><span>${money(sale.total)}</span></div>
      </div>
      <p class="invoice-thanks">Shopping ka shukriya! 🙏</p>
    </div>`;
}

function openInvoiceModal(sale, justCreated) {
  document.getElementById("invoicePreviewContent").innerHTML = invoiceHtml(sale);
  document.getElementById("invoiceModalOverlay").classList.add("show");
  document.getElementById("invoiceModalOverlay").dataset.sale = JSON.stringify(sale);
  if (justCreated) {
    // give the modal a beat to render before invoking print
    setTimeout(() => printCurrentInvoice(sale), 200);
  }
}

function printCurrentInvoice(sale) {
  document.getElementById("printInvoice").innerHTML = invoiceHtml(sale);
  window.print();
}

document.getElementById("closeInvoiceModalBtn")?.addEventListener("click", () => {
  document.getElementById("invoiceModalOverlay").classList.remove("show");
});
document.getElementById("invoiceModalOverlay")?.addEventListener("click", (e) => {
  if (e.target.id === "invoiceModalOverlay") e.currentTarget.classList.remove("show");
});
document.getElementById("printInvoiceBtn")?.addEventListener("click", () => {
  const sale = JSON.parse(document.getElementById("invoiceModalOverlay").dataset.sale || "{}");
  printCurrentInvoice(sale);
});

// ============================================================
// SALES HISTORY + DASHBOARD SALES STATS
// ============================================================
requireAuth(() => {
  db.collection(SALES_COLLECTION)
    .orderBy("createdAt", "desc")
    .limit(500)
    .onSnapshot(
      (snap) => {
        allSales = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        renderSalesTable();
        renderSalesOverviewStats();
      },
      (err) => {
        console.error(err);
        showToast("Sales data load karne mein masla hua.");
      }
    );
});

function getFilteredSales() {
  return allSales.filter((s) => {
    const matchesSearch =
      !salesSearchTerm ||
      (s.invoiceNo || "").toLowerCase().includes(salesSearchTerm) ||
      (s.customerName || "").toLowerCase().includes(salesSearchTerm);
    const matchesDate = !salesDateFilter || isSameDay(s.createdAt, salesDateFilter);
    return matchesSearch && matchesDate;
  });
}

function renderSalesTable() {
  const tbody = document.getElementById("salesTableBody");
  if (!tbody) return;
  const filtered = getFilteredSales();

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7"><div class="empty-state"><h4>Koi sale nahi mili</h4><p>Filter badal kar dekhein ya nayi sale banayein.</p></div></td></tr>';
    return;
  }

  tbody.innerHTML = filtered
    .map(
      (s) => `
    <tr>
      <td>${escapeHtml(s.invoiceNo)}</td>
      <td>${fmtDate(s.createdAt)}</td>
      <td>${escapeHtml(s.customerName || "Walk-in Customer")}</td>
      <td>${(s.items || []).length}</td>
      <td><span class="pay-badge">${escapeHtml(s.paymentMethod || "—")}</span></td>
      <td>${money(s.total)}</td>
      <td class="sales-row-actions">
        <button class="btn btn-ghost btn-sm" data-view-sale="${s.id}">View</button>
        <button class="btn btn-danger btn-sm" data-delete-sale="${s.id}">Delete</button>
      </td>
    </tr>`
    )
    .join("");

  tbody.querySelectorAll("[data-view-sale]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const sale = allSales.find((s) => s.id === btn.dataset.viewSale);
      if (sale) openInvoiceModal(sale, false);
    })
  );
  tbody.querySelectorAll("[data-delete-sale]").forEach((btn) =>
    btn.addEventListener("click", () => deleteSale(btn.dataset.deleteSale))
  );
}

async function deleteSale(saleId) {
  const sale = allSales.find((s) => s.id === saleId);
  if (!sale) return;
  if (!confirm(`Invoice ${sale.invoiceNo} delete karna hai? Stock wapas add ho jayega.`)) return;

  try {
    const batch = db.batch();
    batch.delete(db.collection(SALES_COLLECTION).doc(saleId));
    (sale.items || []).forEach((it) => {
      // Only restock if the product still exists in inventory.
      if (allProducts.some((p) => p.id === it.productId)) {
        batch.update(db.collection(PRODUCTS_COLLECTION).doc(it.productId), {
          stock: firebase.firestore.FieldValue.increment(it.qty),
        });
      }
    });
    await batch.commit();
    showToast("Invoice delete ho gayi aur stock wapas add ho gaya.");
  } catch (err) {
    console.error(err);
    showToast("Delete karne mein masla hua.");
  }
}

document.getElementById("salesSearchInput")?.addEventListener("input", (e) => {
  salesSearchTerm = e.target.value.trim().toLowerCase();
  renderSalesTable();
});
document.getElementById("salesDateFilter")?.addEventListener("change", (e) => {
  salesDateFilter = e.target.value;
  renderSalesTable();
});
document.getElementById("clearSalesFilterBtn")?.addEventListener("click", () => {
  salesSearchTerm = "";
  salesDateFilter = "";
  document.getElementById("salesSearchInput").value = "";
  document.getElementById("salesDateFilter").value = "";
  renderSalesTable();
});

// ---------- Overview stats: today's sales/profit + recent sales ----------
function renderSalesOverviewStats() {
  const todaySales = allSales.filter((s) => isSameDay(s.createdAt));
  const totalToday = todaySales.reduce((sum, s) => sum + Number(s.total || 0), 0);
  const profitToday = todaySales.reduce((sum, s) => sum + Number(s.profit || 0), 0);

  const elSales = document.getElementById("statTodaySales");
  const elProfit = document.getElementById("statTodayProfit");
  const elCount = document.getElementById("statTodayInvoices");
  if (elSales) elSales.textContent = money(totalToday);
  if (elProfit) elProfit.textContent = money(profitToday);
  if (elCount) elCount.textContent = todaySales.length;

  renderWeekChart();

  const recentWrap = document.getElementById("recentSalesList");
  if (recentWrap) {
    const recent = allSales.slice(0, 5);
    if (recent.length === 0) {
      recentWrap.innerHTML = '<div class="empty-state"><h4>Abhi tak koi sale nahi hui</h4><p>Billing / POS se pehli sale banayein.</p></div>';
    } else {
      recentWrap.innerHTML = recent
        .map(
          (s) => `
        <div class="low-stock-row">
          <span>${escapeHtml(s.invoiceNo)} <span style="color:var(--text-muted); font-size:12.5px;">— ${escapeHtml(s.customerName || "Walk-in Customer")}</span></span>
          <span class="badge" style="background:var(--success-soft); color:var(--success);">${money(s.total)}</span>
        </div>`
        )
        .join("");
    }
  }
}

function renderWeekChart() {
  const chart = document.getElementById("weekChart");
  if (!chart) return;

  const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const today = new Date();
  const totals = new Array(7).fill(0);
  const dayKeys = []; // ISO date string for each of the last 7 days, oldest first

  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    dayKeys.push(d.toDateString());
  }

  allSales.forEach((s) => {
    if (!s.createdAt) return;
    const d = s.createdAt.toDate ? s.createdAt.toDate() : new Date(s.createdAt);
    const idx = dayKeys.indexOf(d.toDateString());
    if (idx !== -1) totals[idx] += Number(s.total || 0);
  });

  const max = Math.max(...totals, 1);

  chart.innerHTML = dayKeys
    .map((key, i) => {
      const d = new Date(key);
      const pct = Math.max(4, Math.round((totals[i] / max) * 100));
      return `
      <div class="week-chart-col" title="${money(totals[i])}">
        <div class="week-chart-bar" style="height:${pct}%;"></div>
        <div class="week-chart-day">${dayLabels[d.getDay()]}</div>
      </div>`;
    })
    .join("");
}

document.getElementById("viewAllSalesLink")?.addEventListener("click", (e) => {
  e.preventDefault();
  document.querySelector('.nav-item[data-view="sales"]')?.click();
});

renderCart(); // initial empty-state render

// Recompute cart-affected billing grid whenever products update.
const _origRenderAll = typeof renderAll === "function" ? renderAll : null;
if (_origRenderAll) {
  renderAll = function () {
    _origRenderAll();
    renderPosProductGrid();
  };
}
