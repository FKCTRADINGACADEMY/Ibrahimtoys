/* =========================================================================
   js/thermal-printer.js
   -------------------------------------------------------------------------
   Approach: build a tiny receipt-only HTML document sized to the thermal
   paper width and send it to window.print(). This works with virtually any
   thermal printer (USB, Bluetooth, or network) once it's installed as a
   printer on the phone/PC/POS terminal — no vendor SDK or pairing code
   needed. On Android, pick the thermal printer in the system print sheet;
   most POS printer apps (RawBT, etc.) also register themselves there.
   ========================================================================= */

window.Receipt = {
  fmt(n) {
    const sym = (window.CFG && CFG.currencySymbol) || "";
    return sym + " " + (Number(n) || 0).toLocaleString("en-PK", { minimumFractionDigits: 0 });
  },

  _escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  },

  buildHTML(sale) {
    const cfg = window.CFG || {};
    const paper = cfg.receiptPaperWidth === "58mm" ? "58mm" : "80mm";
    const shopName = this._escapeHtml(cfg.shopName || "Shop");
    const items = sale.items || [];
    const dt = new Date(sale.date || sale.updatedAt || Date.now());

    const rows = items.map(it => `
      <tr>
        <td class="name">${this._escapeHtml(it.name)}${it.qty > 1 ? `<div class="sub">${it.qty} x ${this.fmt(it.price)}</div>` : ""}</td>
        <td class="amt">${this.fmt(it.qty * it.price)}</td>
      </tr>`).join("");

    return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<title>Receipt</title>
<style>
  @page { size: ${paper} auto; margin: 0; }
  * { box-sizing: border-box; }
  body {
    width: ${paper}; margin: 0 auto; padding: 6px 8px 16px;
    font-family: 'Courier New', monospace; font-size: 12px; color: #000;
  }
  .center { text-align: center; }
  .shop { font-size: 15px; font-weight: 700; margin: 0 0 2px; }
  .tag { font-size: 10px; margin: 0 0 6px; }
  .divider { border-top: 1px dashed #000; margin: 6px 0; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 2px 0; vertical-align: top; }
  .name { width: 68%; }
  .amt { width: 32%; text-align: right; white-space: nowrap; }
  .sub { font-size: 10px; color: #333; }
  .totals td { padding: 1px 0; }
  .grand { font-weight: 700; font-size: 14px; }
  .meta { font-size: 10.5px; margin: 2px 0; }
  .footer { text-align: center; font-size: 11px; margin-top: 10px; }
</style>
</head>
<body onload="window.print(); setTimeout(() => window.close(), 300);">
  <div class="center">
    <p class="shop">${shopName}</p>
    ${cfg.shopTagline ? `<p class="tag">${this._escapeHtml(cfg.shopTagline)}</p>` : ""}
  </div>
  <div class="divider"></div>
  <p class="meta">Receipt #: ${this._escapeHtml(sale.receiptNo || sale.id)}</p>
  <p class="meta">Date: ${dt.toLocaleString("en-PK")}</p>
  ${sale.customerName ? `<p class="meta">Customer: ${this._escapeHtml(sale.customerName)}</p>` : ""}
  <div class="divider"></div>
  <table>${rows}</table>
  <div class="divider"></div>
  <table class="totals">
    <tr><td>Subtotal</td><td class="amt">${this.fmt(sale.subtotal)}</td></tr>
    ${sale.discount ? `<tr><td>Discount</td><td class="amt">-${this.fmt(sale.discount)}</td></tr>` : ""}
    <tr class="grand"><td>Total</td><td class="amt">${this.fmt(sale.total)}</td></tr>
    <tr><td>Paid via</td><td class="amt">${this._escapeHtml(sale.paymentMethod || "Cash")}</td></tr>
  </table>
  <div class="divider"></div>
  <p class="footer">${this._escapeHtml(cfg.receiptFooterNote || "Thank you!")}</p>
</body></html>`;
  },

  /** Opens the print dialog for a completed sale. */
  print(sale) {
    const html = this.buildHTML(sale);
    const win = window.open("", "receipt", "width=380,height=600");
    if (!win) {
      alert("Popup blocked hai — receipt print karne ke liye popups allow karen.");
      return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
  }
};
