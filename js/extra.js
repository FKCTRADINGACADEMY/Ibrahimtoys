// ============================================================
// EXTRA FEATURES — Notifications, Best Sellers, Offers, Customers
// Same offline-first Firestore pattern as inventory.js / pos.js.
// ============================================================

let allOffers = [];
let allCustomers = [];
let offerFilter = "All";
let bestsellerRange = "All";
let customerSearchTerm = "";
let editingOfferId = null;
let editingCustomerId = null;

// ============================================================
// NOTIFICATIONS (computed from products + today's sales — no
// extra Firestore collection needed)
// ============================================================
const notifBtn = document.getElementById("notifBtn");
const notifDropdown = document.getElementById("notifDropdown");

notifBtn?.addEventListener("click", (e) => {
  e.stopPropagation();
  notifDropdown.classList.toggle("show");
});
document.addEventListener("click", (e) => {
  if (notifDropdown && !notifDropdown.contains(e.target) && e.target !== notifBtn) {
    notifDropdown.classList.remove("show");
  }
});

function renderNotifications() {
  const list = document.getElementById("notifList");
  const badge = document.getElementById("notifBadge");
  if (!list || !badge) return;

  const lows = (allProducts || []).filter((p) => Number(p.stock) <= Number(p.threshold));
  const todaySales = (allSales || []).filter((s) => isSameDay(s.createdAt));

  const rows = [];
  lows.slice(0, 6).forEach((p) => {
    rows.push(`
      <div class="notif-row">
        <div class="notif-row-icon danger">⚠️</div>
        <div>
          <div class="notif-row-title">${escapeHtml(p.name)} low on stock</div>
          <div class="notif-row-sub">Sirf ${p.stock} units bache hain (${escapeHtml(p.category)})</div>
        </div>
      </div>`);
  });
  todaySales.slice(0, 5).forEach((s) => {
    rows.push(`
      <div class="notif-row">
        <div class="notif-row-icon info">🧾</div>
        <div>
          <div class="notif-row-title">New sale — ${money(s.total)}</div>
          <div class="notif-row-sub">${escapeHtml(s.invoiceNo)} · ${escapeHtml(s.customerName || "Walk-in Customer")}</div>
        </div>
      </div>`);
  });

  const count = lows.length + todaySales.length;
  if (count > 0) {
    badge.style.display = "flex";
    badge.textContent = count > 99 ? "99+" : String(count);
  } else {
    badge.style.display = "none";
  }

  list.innerHTML = rows.length
    ? rows.join("")
    : '<div class="empty-state" style="padding:34px 16px;"><h4>Sab theek hai 👍</h4><p>Koi nayi notification nahi hai.</p></div>';
}

// Piggyback on the existing render pipelines so notifications
// refresh whenever products or sales update in realtime.
(function hookNotifications() {
  const prevRenderAll = renderAll;
  renderAll = function () {
    prevRenderAll();
    renderNotifications();
  };
  const prevSalesStats = renderSalesOverviewStats;
  renderSalesOverviewStats = function () {
    prevSalesStats();
    renderNotifications();
    renderBestsellerList();
  };
})();

// ============================================================
// BEST SELLERS (computed from sales items — no extra collection)
// ============================================================
document.querySelectorAll("#bestsellerFilterChips .chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    document.querySelectorAll("#bestsellerFilterChips .chip").forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    bestsellerRange = chip.dataset.cat;
    renderBestsellerList();
  });
});

function renderBestsellerList() {
  const wrap = document.getElementById("bestsellerList");
  if (!wrap) return;

  let sales = allSales || [];
  if (bestsellerRange !== "All") {
    const days = Number(bestsellerRange);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    sales = sales.filter((s) => {
      if (!s.createdAt) return false;
      const d = s.createdAt.toDate ? s.createdAt.toDate() : new Date(s.createdAt);
      return d >= cutoff;
    });
  }

  const agg = {};
  sales.forEach((s) => {
    (s.items || []).forEach((it) => {
      const key = it.productId || it.name;
      if (!agg[key]) agg[key] = { name: it.name, category: it.category, qty: 0, revenue: 0 };
      agg[key].qty += Number(it.qty || 0);
      agg[key].revenue += Number(it.lineTotal || it.price * it.qty || 0);
    });
  });

  const ranked = Object.values(agg).sort((a, b) => b.qty - a.qty).slice(0, 15);

  if (ranked.length === 0) {
    wrap.innerHTML = '<div class="empty-state"><h4>Abhi tak koi sale nahi hui</h4><p>Best sellers yahan sales ke baad nazar aayenge.</p></div>';
    return;
  }

  const maxQty = ranked[0].qty || 1;
  wrap.innerHTML = ranked
    .map(
      (p, i) => `
    <div class="bestseller-row">
      <div class="bestseller-rank">${i + 1}</div>
      <div class="bestseller-info">
        <div class="bestseller-name">${escapeHtml(p.name)}</div>
        <div class="bestseller-sub">${escapeHtml(p.category || "")}</div>
        <div class="bestseller-bar-track"><div class="bestseller-bar-fill" style="width:${Math.round((p.qty / maxQty) * 100)}%;"></div></div>
      </div>
      <div class="bestseller-revenue">
        <div class="amt">${money(p.revenue)}</div>
        <div class="qty">${p.qty} sold</div>
      </div>
    </div>`
    )
    .join("");
}

// ============================================================
// OFFERS / DISCOUNTS
// ============================================================
requireAuth(() => {
  db.collection(OFFERS_COLLECTION)
    .orderBy("createdAt", "desc")
    .onSnapshot(
      (snap) => {
        allOffers = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        renderOfferGrid();
        renderOfferSelect();
      },
      (err) => {
        console.error(err);
        showToast("Offers load karne mein masla hua.");
      }
    );
});

document.querySelectorAll("#offerFilterChips .chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    document.querySelectorAll("#offerFilterChips .chip").forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    offerFilter = chip.dataset.cat;
    renderOfferGrid();
  });
});

function renderOfferGrid() {
  const grid = document.getElementById("offerGrid");
  const badge = document.getElementById("offersNavBadge");
  if (!grid) return;

  const activeCount = allOffers.filter((o) => o.active).length;
  if (badge) {
    badge.style.display = activeCount > 0 ? "inline-block" : "none";
    badge.textContent = activeCount;
  }

  const filtered = allOffers.filter((o) => {
    if (offerFilter === "Active") return !!o.active;
    if (offerFilter === "Inactive") return !o.active;
    return true;
  });

  if (filtered.length === 0) {
    grid.innerHTML = '<div class="empty-state" style="grid-column: 1 / -1;"><h4>Koi offer nahi hai</h4><p>"+ New Offer" se pehla discount offer banayein.</p></div>';
    return;
  }

  grid.innerHTML = filtered
    .map(
      (o) => `
    <div class="offer-card ${o.active ? "" : "inactive"}">
      <div class="offer-card-top">
        <div class="offer-percent">${Number(o.discount)}% OFF</div>
        <div class="offer-status">${o.active ? "Active" : "Inactive"}</div>
      </div>
      <div class="offer-title">${escapeHtml(o.title)}</div>
      <div class="offer-meta">Applies to: ${escapeHtml(o.category || "All")}${o.note ? " · " + escapeHtml(o.note) : ""}</div>
      ${o.code ? `<div class="offer-code">${escapeHtml(o.code)}</div>` : ""}
      <div class="offer-card-actions">
        <button class="btn btn-sm" data-edit-offer="${o.id}">Edit</button>
        <button class="btn btn-sm" data-toggle-offer="${o.id}">${o.active ? "Deactivate" : "Activate"}</button>
        <button class="btn btn-sm" data-delete-offer="${o.id}">Delete</button>
      </div>
    </div>`
    )
    .join("");

  grid.querySelectorAll("[data-edit-offer]").forEach((b) => b.addEventListener("click", () => openOfferModal(b.dataset.editOffer)));
  grid.querySelectorAll("[data-toggle-offer]").forEach((b) => b.addEventListener("click", () => toggleOffer(b.dataset.toggleOffer)));
  grid.querySelectorAll("[data-delete-offer]").forEach((b) => b.addEventListener("click", () => deleteOffer(b.dataset.deleteOffer)));
}

function renderOfferSelect() {
  const sel = document.getElementById("offerSelect");
  if (!sel) return;
  const current = sel.value;
  const active = allOffers.filter((o) => o.active);
  sel.innerHTML =
    '<option value="">No offer</option>' +
    active.map((o) => `<option value="${o.id}">${escapeHtml(o.title)} — ${Number(o.discount)}% (${escapeHtml(o.category || "All")})</option>`).join("");
  if (active.some((o) => o.id === current)) sel.value = current;
}

document.getElementById("offerSelect")?.addEventListener("change", (e) => {
  const offer = allOffers.find((o) => o.id === e.target.value);
  const discountInput = document.getElementById("discountInput");
  if (!offer) return;
  const relevant = (typeof cart !== "undefined" ? cart : []).filter(
    (c) => offer.category === "All" || c.category === offer.category
  );
  const base = relevant.reduce((sum, c) => sum + c.price * c.qty, 0);
  const discountAmt = Math.round((base * Number(offer.discount)) / 100);
  discountInput.value = discountAmt;
  renderCartSummary();
  showToast(`"${offer.title}" apply ho gaya — ${money(discountAmt)} discount.`);
});

const offerModalOverlay = document.getElementById("offerModalOverlay");
const offerForm = document.getElementById("offerForm");

document.getElementById("addOfferBtn")?.addEventListener("click", () => openOfferModal(null));
document.getElementById("cancelOfferModalBtn")?.addEventListener("click", closeOfferModal);
offerModalOverlay?.addEventListener("click", (e) => {
  if (e.target === offerModalOverlay) closeOfferModal();
});

function openOfferModal(id) {
  editingOfferId = id;
  const isEdit = Boolean(id);
  document.getElementById("offerModalTitle").textContent = isEdit ? "Edit Offer" : "New Offer";

  if (isEdit) {
    const o = allOffers.find((x) => x.id === id);
    document.getElementById("offerId").value = o.id;
    document.getElementById("oTitle").value = o.title;
    document.getElementById("oDiscount").value = o.discount;
    document.getElementById("oCode").value = o.code || "";
    document.getElementById("oCategory").value = o.category || "All";
    document.getElementById("oActive").value = String(!!o.active);
    document.getElementById("oNote").value = o.note || "";
  } else {
    offerForm.reset();
    document.getElementById("offerId").value = "";
    document.getElementById("oActive").value = "true";
  }
  offerModalOverlay.classList.add("show");
}

function closeOfferModal() {
  offerModalOverlay.classList.remove("show");
  editingOfferId = null;
}

offerForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const saveBtn = document.getElementById("saveOfferBtn");
  saveBtn.disabled = true;
  saveBtn.textContent = "Saving...";

  const data = {
    title: document.getElementById("oTitle").value.trim(),
    discount: Number(document.getElementById("oDiscount").value),
    code: document.getElementById("oCode").value.trim().toUpperCase(),
    category: document.getElementById("oCategory").value,
    active: document.getElementById("oActive").value === "true",
    note: document.getElementById("oNote").value.trim(),
  };

  try {
    const id = document.getElementById("offerId").value;
    if (id) {
      await db.collection(OFFERS_COLLECTION).doc(id).update(data);
      showToast("Offer update ho gaya.");
    } else {
      data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      await db.collection(OFFERS_COLLECTION).add(data);
      showToast("Naya offer add ho gaya.");
    }
    closeOfferModal();
  } catch (err) {
    console.error(err);
    showToast("Offer save karne mein masla hua.");
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = "Save Offer";
  }
});

async function toggleOffer(id) {
  const o = allOffers.find((x) => x.id === id);
  if (!o) return;
  try {
    await db.collection(OFFERS_COLLECTION).doc(id).update({ active: !o.active });
  } catch (err) {
    console.error(err);
    showToast("Offer update karne mein masla hua.");
  }
}

async function deleteOffer(id) {
  const o = allOffers.find((x) => x.id === id);
  if (!o) return;
  if (!confirm(`"${o.title}" offer delete karna hai?`)) return;
  try {
    await db.collection(OFFERS_COLLECTION).doc(id).delete();
    showToast("Offer delete ho gaya.");
  } catch (err) {
    console.error(err);
    showToast("Delete karne mein masla hua.");
  }
}

// ============================================================
// CUSTOMERS
// ============================================================
requireAuth(() => {
  db.collection(CUSTOMERS_COLLECTION)
    .orderBy("name")
    .onSnapshot(
      (snap) => {
        allCustomers = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        renderCustomerGrid();
        const statEl = document.getElementById("statCustomers");
        if (statEl) statEl.textContent = allCustomers.length;
      },
      (err) => {
        console.error(err);
        showToast("Customers load karne mein masla hua.");
      }
    );
});

document.getElementById("customerSearchInput")?.addEventListener("input", (e) => {
  customerSearchTerm = e.target.value.trim().toLowerCase();
  renderCustomerGrid();
});

function customerStats(phone) {
  const matches = (allSales || []).filter((s) => phone && (s.customerPhone || "") === phone);
  const totalSpent = matches.reduce((sum, s) => sum + Number(s.total || 0), 0);
  return { orders: matches.length, totalSpent };
}

function renderCustomerGrid() {
  const grid = document.getElementById("customerGrid");
  if (!grid) return;

  const filtered = allCustomers.filter((c) => {
    if (!customerSearchTerm) return true;
    return (
      (c.name || "").toLowerCase().includes(customerSearchTerm) ||
      (c.phone || "").toLowerCase().includes(customerSearchTerm)
    );
  });

  if (filtered.length === 0) {
    grid.innerHTML = '<div class="empty-state" style="grid-column: 1 / -1;"><h4>Koi customer nahi mila</h4><p>Naya customer add karein, ya POS se checkout par phone number dalein — customer khud-ba-khud save ho jayega.</p></div>';
    return;
  }

  grid.innerHTML = filtered
    .map((c) => {
      const stats = customerStats(c.phone);
      const initial = (c.name || "?").trim().charAt(0).toUpperCase();
      return `
      <div class="customer-card">
        <div class="customer-card-head">
          <div class="customer-avatar">${escapeHtml(initial)}</div>
          <div>
            <div class="customer-name">${escapeHtml(c.name)}</div>
            <div class="customer-phone">${escapeHtml(c.phone || "—")}</div>
          </div>
        </div>
        <div class="customer-stats">
          <div><div class="customer-stat-num">${stats.orders}</div><div class="customer-stat-label">Orders</div></div>
          <div><div class="customer-stat-num">${money(stats.totalSpent)}</div><div class="customer-stat-label">Total Spent</div></div>
        </div>
        <div class="card-actions">
          <button class="btn btn-ghost btn-sm" data-edit-customer="${c.id}">Edit</button>
          <button class="btn btn-danger btn-sm" data-delete-customer="${c.id}">Delete</button>
        </div>
      </div>`;
    })
    .join("");

  grid.querySelectorAll("[data-edit-customer]").forEach((b) => b.addEventListener("click", () => openCustomerModal(b.dataset.editCustomer)));
  grid.querySelectorAll("[data-delete-customer]").forEach((b) => b.addEventListener("click", () => deleteCustomer(b.dataset.deleteCustomer)));
}

const customerModalOverlay = document.getElementById("customerModalOverlay");
const customerForm = document.getElementById("customerForm");

document.getElementById("addCustomerBtn")?.addEventListener("click", () => openCustomerModal(null));
document.getElementById("cancelCustomerModalBtn")?.addEventListener("click", closeCustomerModal);
customerModalOverlay?.addEventListener("click", (e) => {
  if (e.target === customerModalOverlay) closeCustomerModal();
});

function openCustomerModal(id) {
  editingCustomerId = id;
  const isEdit = Boolean(id);
  document.getElementById("customerModalTitle").textContent = isEdit ? "Edit Customer" : "Add Customer";

  if (isEdit) {
    const c = allCustomers.find((x) => x.id === id);
    document.getElementById("customerId").value = c.id;
    document.getElementById("cName").value = c.name || "";
    document.getElementById("cPhone").value = c.phone || "";
    document.getElementById("cEmail").value = c.email || "";
    document.getElementById("cAddress").value = c.address || "";
    document.getElementById("cNotes").value = c.notes || "";
  } else {
    customerForm.reset();
    document.getElementById("customerId").value = "";
  }
  customerModalOverlay.classList.add("show");
}

function closeCustomerModal() {
  customerModalOverlay.classList.remove("show");
  editingCustomerId = null;
}

customerForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const saveBtn = document.getElementById("saveCustomerBtn");
  saveBtn.disabled = true;
  saveBtn.textContent = "Saving...";

  const data = {
    name: document.getElementById("cName").value.trim(),
    phone: document.getElementById("cPhone").value.trim(),
    email: document.getElementById("cEmail").value.trim(),
    address: document.getElementById("cAddress").value.trim(),
    notes: document.getElementById("cNotes").value.trim(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  };

  try {
    const id = document.getElementById("customerId").value;
    if (id) {
      await db.collection(CUSTOMERS_COLLECTION).doc(id).update(data);
      showToast("Customer update ho gaya.");
    } else {
      data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      await db.collection(CUSTOMERS_COLLECTION).add(data);
      showToast("Naya customer add ho gaya.");
    }
    closeCustomerModal();
  } catch (err) {
    console.error(err);
    showToast("Customer save karne mein masla hua.");
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = "Save Customer";
  }
});

async function deleteCustomer(id) {
  const c = allCustomers.find((x) => x.id === id);
  if (!c) return;
  if (!confirm(`"${c.name}" ko customer list se delete karna hai?`)) return;
  try {
    await db.collection(CUSTOMERS_COLLECTION).doc(id).delete();
    showToast("Customer delete ho gaya.");
  } catch (err) {
    console.error(err);
    showToast("Delete karne mein masla hua.");
  }
}

// Called from pos.js right after a sale is successfully saved —
// keeps a lightweight customer record in sync automatically
// whenever a phone number is given at checkout.
async function upsertCustomerFromSale(sale) {
  const phone = (sale.customerPhone || "").trim();
  if (!phone) return;
  try {
    const existing = allCustomers.find((c) => c.phone === phone);
    if (existing) return; // stats are computed live from sales, nothing to write
    await db.collection(CUSTOMERS_COLLECTION).add({
      name: sale.customerName && sale.customerName !== "Walk-in Customer" ? sale.customerName : phone,
      phone,
      email: "",
      address: "",
      notes: "Auto-added from POS checkout.",
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error("Auto customer save failed:", err);
  }
}
