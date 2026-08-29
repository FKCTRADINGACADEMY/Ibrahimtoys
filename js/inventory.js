// ============================================================
// INVENTORY — realtime CRUD with offline-first Firestore
// ============================================================

let allProducts = [];
let activeCategory = "All";
let searchTerm = "";
let editingId = null;

// ---------- Theme ----------
const themeToggle = document.getElementById("themeToggle");
function applyTheme(t) {
  document.documentElement.setAttribute("data-theme", t);
  localStorage.setItem("ibrahim-theme", t);
}
applyTheme(localStorage.getItem("ibrahim-theme") || "light");
themeToggle?.addEventListener("click", () => {
  const cur = document.documentElement.getAttribute("data-theme");
  applyTheme(cur === "dark" ? "light" : "dark");
});

// ---------- Sidebar nav (mobile) ----------
document.getElementById("menuToggle")?.addEventListener("click", () => {
  document.getElementById("sidebar").classList.toggle("open");
});

const VIEW_TITLES = {
  overview: "Overview",
  billing: "Billing / POS",
  inventory: "Inventory",
  sales: "Sales History",
};

document.querySelectorAll(".nav-item").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    const view = btn.dataset.view;
    document.querySelectorAll(".view-section").forEach((sec) => {
      sec.style.display = sec.id === "view-" + view ? "" : "none";
    });
    document.getElementById("pageTitle").textContent = VIEW_TITLES[view] || view;
    document.getElementById("sidebar").classList.remove("open");
  });
});

// ---------- Online / offline status ----------
const statusPill = document.getElementById("statusPill");
function updateOnlineStatus() {
  if (navigator.onLine) {
    statusPill.classList.remove("offline");
    statusPill.innerHTML = '<span class="blip"></span> Online';
  } else {
    statusPill.classList.add("offline");
    statusPill.innerHTML = '<span class="blip"></span> Offline — changes will sync later';
  }
}
window.addEventListener("online", updateOnlineStatus);
window.addEventListener("offline", updateOnlineStatus);
updateOnlineStatus();

// ---------- Toast ----------
function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2200);
}

// ---------- Auth guard + realtime listener ----------
requireAuth(() => {
  db.collection(PRODUCTS_COLLECTION)
    .orderBy("name")
    .onSnapshot(
      (snap) => {
        allProducts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        renderAll();
      },
      (err) => {
        console.error(err);
        showToast("Data load karne mein masla hua.");
      }
    );
});

// ---------- Rendering ----------
function renderAll() {
  renderStats();
  renderLowStock();
  renderGrid();
}

function renderStats() {
  const total = allProducts.length;
  const toys = allProducts.filter((p) => p.category === "Toys").length;
  const cosmetics = allProducts.filter((p) => p.category === "Cosmetics").length;
  const low = allProducts.filter((p) => Number(p.stock) <= Number(p.threshold)).length;
  const value = allProducts.reduce((sum, p) => sum + Number(p.cost || 0) * Number(p.stock || 0), 0);

  document.getElementById("statTotal").textContent = total;
  document.getElementById("statToys").textContent = toys;
  document.getElementById("statCosmetics").textContent = cosmetics;
  document.getElementById("statLow").textContent = low;
  document.getElementById("statValue").textContent = "Rs. " + value.toLocaleString("en-PK", { maximumFractionDigits: 0 });
}

function renderLowStock() {
  const wrap = document.getElementById("lowStockList");
  const lows = allProducts.filter((p) => Number(p.stock) <= Number(p.threshold));
  if (lows.length === 0) {
    wrap.innerHTML = '<div class="empty-state"><h4>Sab stock theek hai 🎉</h4><p>Koi item low stock mein nahi hai.</p></div>';
    return;
  }
  wrap.innerHTML = lows
    .map(
      (p) => `
    <div class="low-stock-row">
      <span>${escapeHtml(p.name)} <span style="color:var(--text-muted); font-size:12.5px;">(${escapeHtml(p.category)})</span></span>
      <span class="badge">${p.stock} left</span>
    </div>`
    )
    .join("");
}

function getFiltered() {
  return allProducts.filter((p) => {
    const matchesCat =
      activeCategory === "All" ||
      (activeCategory === "Low" ? Number(p.stock) <= Number(p.threshold) : p.category === activeCategory);
    const matchesSearch =
      !searchTerm ||
      p.name.toLowerCase().includes(searchTerm) ||
      (p.sku || "").toLowerCase().includes(searchTerm);
    return matchesCat && matchesSearch;
  });
}

function renderGrid() {
  const grid = document.getElementById("productGrid");
  const filtered = getFiltered();

  if (filtered.length === 0) {
    grid.innerHTML =
      '<div class="empty-state" style="grid-column: 1 / -1;"><h4>Koi product nahi mila</h4><p>Naya product add karein ya search/filter badlain.</p></div>';
    return;
  }

  grid.innerHTML = filtered.map(productCard).join("");

  grid.querySelectorAll("[data-edit]").forEach((btn) =>
    btn.addEventListener("click", () => openModal(btn.dataset.edit))
  );
  grid.querySelectorAll("[data-delete]").forEach((btn) =>
    btn.addEventListener("click", () => deleteProduct(btn.dataset.delete, btn.dataset.name))
  );
}

function productCard(p) {
  const stock = Number(p.stock);
  const threshold = Number(p.threshold) || 1;
  const ratio = Math.min(1, stock / Math.max(threshold * 3, 1)); // shelf fills relative to ~3x threshold
  const pct = Math.round(ratio * 100);
  const isLow = stock <= threshold;
  const accent = isLow ? "var(--danger)" : p.category === "Toys" ? "var(--toy-amber)" : "var(--cosmetic-rose)";

  return `
  <div class="product-card">
    <span class="cat-tag ${escapeHtml(p.category)}">${escapeHtml(p.category)}</span>
    <div>
      <div class="p-name">${escapeHtml(p.name)}</div>
      <div class="p-sku">SKU: ${escapeHtml(p.sku || "—")}</div>
    </div>
    <div class="p-price-row">
      <span>Cost: Rs. ${Number(p.cost).toLocaleString()}</span>
      <span class="p-price">Rs. ${Number(p.price).toLocaleString()}</span>
    </div>
    <div class="shelf-bar-wrap">
      <div class="shelf-bar-labels">
        <span>${isLow ? "Low stock" : "In stock"}</span>
        <span>${stock} units</span>
      </div>
      <div class="shelf-bar-track">
        <div class="shelf-bar-fill" style="width:${pct}%; background:${accent};"></div>
      </div>
    </div>
    <div class="card-actions">
      <button class="btn btn-ghost btn-sm" data-edit="${p.id}">Edit</button>
      <button class="btn btn-danger btn-sm" data-delete="${p.id}" data-name="${escapeHtml(p.name)}">Delete</button>
    </div>
  </div>`;
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---------- Filters ----------
document.querySelectorAll("#filterChips .chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    document.querySelectorAll("#filterChips .chip").forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    activeCategory = chip.dataset.cat;
    renderGrid();
  });
});

document.getElementById("searchInput").addEventListener("input", (e) => {
  searchTerm = e.target.value.trim().toLowerCase();
  renderGrid();
});

// ---------- Modal: Add / Edit ----------
const modalOverlay = document.getElementById("modalOverlay");
const productForm = document.getElementById("productForm");

document.getElementById("addProductBtn").addEventListener("click", () => openModal(null));
document.getElementById("cancelModalBtn").addEventListener("click", closeModal);
modalOverlay.addEventListener("click", (e) => {
  if (e.target === modalOverlay) closeModal();
});

function openModal(id) {
  editingId = id;
  const isEdit = Boolean(id);
  document.getElementById("modalTitle").textContent = isEdit ? "Edit Product" : "Add Product";

  if (isEdit) {
    const p = allProducts.find((x) => x.id === id);
    document.getElementById("productId").value = p.id;
    document.getElementById("pName").value = p.name;
    document.getElementById("pSku").value = p.sku || "";
    document.getElementById("pCategory").value = p.category;
    document.getElementById("pCost").value = p.cost;
    document.getElementById("pPrice").value = p.price;
    document.getElementById("pStock").value = p.stock;
    document.getElementById("pThreshold").value = p.threshold;
    document.getElementById("pSupplier").value = p.supplier || "";
  } else {
    productForm.reset();
    document.getElementById("productId").value = "";
    document.getElementById("pThreshold").value = 5;
  }
  modalOverlay.classList.add("show");
}

function closeModal() {
  modalOverlay.classList.remove("show");
  editingId = null;
}

productForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const saveBtn = document.getElementById("saveProductBtn");
  saveBtn.disabled = true;
  saveBtn.textContent = "Saving...";

  const data = {
    name: document.getElementById("pName").value.trim(),
    sku: document.getElementById("pSku").value.trim(),
    category: document.getElementById("pCategory").value,
    cost: Number(document.getElementById("pCost").value),
    price: Number(document.getElementById("pPrice").value),
    stock: Number(document.getElementById("pStock").value),
    threshold: Number(document.getElementById("pThreshold").value),
    supplier: document.getElementById("pSupplier").value.trim(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  };

  try {
    const id = document.getElementById("productId").value;
    if (id) {
      await db.collection(PRODUCTS_COLLECTION).doc(id).update(data);
      showToast("Product update ho gaya" + (navigator.onLine ? "." : " — offline, sync hoga jab internet aayega."));
    } else {
      data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      await db.collection(PRODUCTS_COLLECTION).add(data);
      showToast("Naya product add ho gaya" + (navigator.onLine ? "." : " — offline, sync hoga jab internet aayega."));
    }
    closeModal();
  } catch (err) {
    console.error(err);
    showToast("Save karne mein masla hua.");
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = "Save Product";
  }
});

async function deleteProduct(id, name) {
  if (!confirm(`"${name}" ko delete karna hai?`)) return;
  try {
    await db.collection(PRODUCTS_COLLECTION).doc(id).delete();
    showToast("Product delete ho gaya.");
  } catch (err) {
    console.error(err);
    showToast("Delete karne mein masla hua.");
  }
}
