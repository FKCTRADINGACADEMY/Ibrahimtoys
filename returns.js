// ============================================================
// RETURNS — track returned items, restock automatically, and
// feed the dashboard "Returns Today" stat + the printed stock
// report (sold vs returned per product).
// Same offline-first Firestore pattern as inventory.js / pos.js.
// ============================================================

const RETURNS_COLLECTION = "returns";
let allReturns = [];
let returnsSearchTerm = "";

requireAuth(() => {
  db.collection(RETURNS_COLLECTION)
    .orderBy("createdAt", "desc")
    .limit(500)
    .onSnapshot(
      (snap) => {
        allReturns = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        renderReturnsTable();
        renderReturnsStat();
      },
      (err) => {
        console.error(err);
        showToast("Returns data load karne mein masla hua.");
      }
    );
});

function renderReturnsStat() {
  const el = document.getElementById("statReturnsToday");
  if (!el) return;
  const today = allReturns.filter((r) => isSameDay(r.createdAt));
  el.textContent = today.reduce((sum, r) => sum + Number(r.qty || 0), 0);
}

function getFilteredReturns() {
  return allReturns.filter((r) => {
    if (!returnsSearchTerm) return true;
    return (
      (r.productName || "").toLowerCase().includes(returnsSearchTerm) ||
      (r.invoiceNo || "").toLowerCase().includes(returnsSearchTerm)
    );
  });
}

function renderReturnsTable() {
  const tbody = document.getElementById("returnsTableBody");
  if (!tbody) return;
  const filtered = getFilteredReturns();

  if (filtered.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="7"><div class="empty-state"><h4>Koi return nahi hai</h4><p>"+ New Return" se ek return darj karein.</p></div></td></tr>';
    return;
  }

  tbody.innerHTML = filtered
    .map(
      (r) => `
    <tr>
      <td>${fmtDate(r.createdAt)}</td>
      <td>${escapeHtml(r.productName)}</td>
      <td>${r.qty}</td>
      <td>${escapeHtml(r.invoiceNo || "—")}</td>
      <td>${escapeHtml(r.reason || "—")}</td>
      <td>${money(r.refund || 0)}</td>
      <td><button class="btn btn-danger btn-sm" data-delete-return="${r.id}">Delete</button></td>
    </tr>`
    )
    .join("");

  tbody.querySelectorAll("[data-delete-return]").forEach((btn) =>
    btn.addEventListener("click", () => deleteReturn(btn.dataset.deleteReturn))
  );
}

document.getElementById("returnsSearchInput")?.addEventListener("input", (e) => {
  returnsSearchTerm = e.target.value.trim().toLowerCase();
  renderReturnsTable();
});

// ---------- Add Return modal ----------
const returnModalOverlay = document.getElementById("returnModalOverlay");
const returnForm = document.getElementById("returnForm");

document.getElementById("addReturnBtn")?.addEventListener("click", openReturnModal);
document.getElementById("cancelReturnModalBtn")?.addEventListener("click", closeReturnModal);
returnModalOverlay?.addEventListener("click", (e) => {
  if (e.target === returnModalOverlay) closeReturnModal();
});

function openReturnModal() {
  const sel = document.getElementById("rProduct");
  sel.innerHTML = (allProducts || [])
    .map((p) => `<option value="${p.id}">${escapeHtml(p.name)} (${escapeHtml(p.sku || "—")})</option>`)
    .join("");

  if (!allProducts || allProducts.length === 0) {
    showToast("Pehle inventory mein products add karein.");
    return;
  }

  returnForm.reset();
  document.getElementById("rQty").value = 1;
  document.getElementById("rRefund").value = 0;
  returnModalOverlay.classList.add("show");
}

function closeReturnModal() {
  returnModalOverlay.classList.remove("show");
}

returnForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const saveBtn = document.getElementById("saveReturnBtn");
  saveBtn.disabled = true;
  saveBtn.textContent = "Saving...";

  try {
    const productId = document.getElementById("rProduct").value;
    const product = allProducts.find((p) => p.id === productId);
    if (!product) throw new Error("Product nahi mila.");

    const qty = Number(document.getElementById("rQty").value);
    if (!qty || qty < 1) throw new Error("Sahi quantity dalein.");

    const data = {
      productId,
      productName: product.name,
      sku: product.sku || "",
      qty,
      invoiceNo: document.getElementById("rInvoice").value.trim(),
      reason: document.getElementById("rReason").value.trim(),
      refund: Number(document.getElementById("rRefund").value || 0),
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdByEmail: (auth.currentUser && auth.currentUser.email) || "",
    };

    const batch = db.batch();
    const returnRef = db.collection(RETURNS_COLLECTION).doc();
    batch.set(returnRef, data);
    batch.update(db.collection(PRODUCTS_COLLECTION).doc(productId), {
      stock: firebase.firestore.FieldValue.increment(qty),
    });
    await batch.commit();

    showToast("Return darj ho gaya aur stock wapas add ho gaya.");
    closeReturnModal();
  } catch (err) {
    console.error(err);
    showToast(err.message || "Return save karne mein masla hua.");
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = "Save Return";
  }
});

async function deleteReturn(id) {
  const r = allReturns.find((x) => x.id === id);
  if (!r) return;
  if (!confirm(`"${r.productName}" ka return delete karna hai? Stock dobara ghatt jayega.`)) return;
  try {
    const batch = db.batch();
    batch.delete(db.collection(RETURNS_COLLECTION).doc(id));
    if (allProducts.some((p) => p.id === r.productId)) {
      batch.update(db.collection(PRODUCTS_COLLECTION).doc(r.productId), {
        stock: firebase.firestore.FieldValue.increment(-r.qty),
      });
    }
    await batch.commit();
    showToast("Return delete ho gaya.");
  } catch (err) {
    console.error(err);
    showToast("Delete karne mein masla hua.");
  }
}

// Refresh the "Returns Today" stat whenever sales stats refresh too
// (keeps the dashboard in sync on the same render cycle).
(function hookReturnsStat() {
  if (typeof renderSalesOverviewStats !== "function") return;
  const prev = renderSalesOverviewStats;
  renderSalesOverviewStats = function () {
    prev();
    renderReturnsStat();
  };
})();
