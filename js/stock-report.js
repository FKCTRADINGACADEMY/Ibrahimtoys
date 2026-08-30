// ============================================================
// STOCK REPORT — thermal-printer checklist (name, stock, price,
// sold, returned + a tick box for physical stock verification),
// and tappable dashboard stat cards that jump straight to the
// relevant view.
// ============================================================

// ---------- Dashboard card tap -> navigate ----------
function goToView(view, opts = {}) {
  document.querySelector(`.nav-item[data-view="${view}"]`)?.click();
  if (opts.category) {
    document.querySelector(`#filterChips .chip[data-cat="${opts.category}"]`)?.click();
  }
}
window.goToView = goToView;

// ---------- Build per-product sold / returned totals ----------
function buildStockReportRows(products) {
  const soldMap = {};
  (allSales || []).forEach((s) =>
    (s.items || []).forEach((it) => {
      soldMap[it.productId] = (soldMap[it.productId] || 0) + Number(it.qty || 0);
    })
  );

  const retMap = {};
  (allReturns || []).forEach((r) => {
    retMap[r.productId] = (retMap[r.productId] || 0) + Number(r.qty || 0);
  });

  return products.map((p) => ({
    name: p.name,
    sku: p.sku || "",
    stock: Number(p.stock || 0),
    price: Number(p.price || 0),
    value: Number(p.stock || 0) * Number(p.price || 0),
    sold: soldMap[p.id] || 0,
    returned: retMap[p.id] || 0,
  }));
}

// ---------- Print via ESC/POS thermal printer (Bluetooth/USB) ----------
async function printStockReport(products) {
  if (!products || products.length === 0) {
    showToast("Print karne ke liye koi product nahi mila.");
    return;
  }
  if (!window.shopPrinter) {
    showToast("Printer module load nahi hua.");
    return;
  }

  const rows = buildStockReportRows(products);
  const btn = document.getElementById("printStockReportBtn");
  const originalLabel = btn ? btn.textContent : "";
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Printing...";
  }

  try {
    const p = window.shopPrinter;
    if (!p.isConnected) {
      showToast("Printer se connect ho raha hai...");
      await p.connect();
    }

    await p.init();
    await p.printText("STOCK CHECK REPORT", { align: "center", bold: true });
    await p.printText(p._line(), { align: "center" });
    await p.printSmall(new Date().toLocaleString("en-PK"), { align: "center" });
    await p.printText(p._line(), { align: "center" });

    let totalStock = 0,
      totalSold = 0,
      totalRet = 0,
      totalValue = 0;

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      totalStock += r.stock;
      totalSold += r.sold;
      totalRet += r.returned;
      totalValue += r.value;

      await p.printText(`${i + 1}. ${r.name}`, { bold: true });
      await p.printText(`Stk:${r.stock}  Price:${r.price}  Val:${r.value}`);
      await p.printText(`Sold:${r.sold}  Ret:${r.returned}   [   ]`);
      await p.printText(p._line());
    }

    await p.printText(p._line(), { align: "center" });
    await p.printText(`Total Stock:    ${totalStock}`, { bold: true });
    await p.printText(`Total Value:    Rs.${totalValue}`);
    await p.printText(`Total Sold:     ${totalSold}`);
    await p.printText(`Total Returned: ${totalRet}`);
    await p.printText(p._line(), { align: "center" });
    await p.printSmall("[   ] = tick after physical check", { align: "center" });
    await p.doCut();

    showToast("Stock report print ho gayi.");
  } catch (err) {
    console.error(err);
    showToast("Print karne mein masla hua: " + (err.message || err));
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = originalLabel || "🖨 Print Stock Report";
    }
  }
}

// Prints exactly what's currently shown in the Inventory view —
// respects the active category chip (All / Toys / Cosmetics /
// Low Stock) and the search box, so tapping "Low Stock" first and
// then printing gives a focused checklist of just those items.
document.getElementById("printStockReportBtn")?.addEventListener("click", () => {
  const list = typeof getFiltered === "function" ? getFiltered() : allProducts || [];
  printStockReport(list);
});
