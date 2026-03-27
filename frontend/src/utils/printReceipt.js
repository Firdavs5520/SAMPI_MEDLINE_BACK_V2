const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const formatNumber = (value) => {
  const safe = Number.isFinite(Number(value)) ? Number(value) : 0;
  return safe.toLocaleString("uz-UZ");
};

const formatCheckDate = (value) => {
  if (!value) return "-";
  const safeDate = new Date(value);
  if (Number.isNaN(safeDate.getTime())) return "-";
  return safeDate.toLocaleString("uz-UZ");
};

const buildItemRows = (items, itemType) => {
  return (items || [])
    .filter((item) => (item.itemType || "").toLowerCase() === itemType)
    .map((item) => {
      const quantity = Number(item.quantity) || 0;
      const unitPrice = Number(item.price) || 0;
      const lineTotal = unitPrice * quantity;
      return `
        <div class="row">
          <span>${escapeHtml(item.name)} x${escapeHtml(quantity)}</span>
          <span>${escapeHtml(formatNumber(lineTotal))}</span>
        </div>
      `;
    })
    .join("");
};

const buildCheckPrintHtml = (check) => {
  const medicineRows = buildItemRows(check.items, "medicine");
  const serviceRows = buildItemRows(check.items, "service");

  return `<!doctype html>
<html lang="uz">
  <head>
    <meta charset="UTF-8" />
    <title>Chek - ${escapeHtml(check.checkId)}</title>
    <style>
      @import url("https://fonts.googleapis.com/css2?family=Golos+Text:wght@400;500;600;700;800;900&display=swap");

      @page {
        size: 58mm auto;
        margin: 0;
      }

      * {
        box-sizing: border-box;
      }

      html, body {
        margin: 0;
        padding: 0;
        width: 58mm;
        background: #fff;
        font-family: "Golos Text", Arial, Helvetica, sans-serif;
        color: #000;
        overflow: hidden;
      }

      .check {
        width: 58mm;
        padding: 0;
        text-align: center;
      }

      .check-inner {
        width: 48mm;
        margin: 0 auto;
        padding: 4px 0;
      }

      .check-title {
        font-size: 16px;
        font-weight: 900;
        letter-spacing: 0.3px;
        white-space: nowrap;
      }

      .divider {
        border-top: 1px dashed #000;
        margin: 4px 0;
      }

      .text {
        font-size: 11px;
        margin: 1px 0;
      }

      .section-title {
        font-size: 13px;
        font-weight: 700;
        margin-top: 2px;
      }

      .row {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        font-size: 11px;
        margin: 1px 0;
        gap: 2mm;
      }

      .row span:first-child {
        flex: 1;
        min-width: 0;
        max-width: 30mm;
        word-break: break-word;
        text-align: left;
      }

      .row span:last-child {
        white-space: nowrap;
      }

      .jami {
        display: flex;
        justify-content: space-between;
        font-size: 12px;
        font-weight: 700;
        margin-top: 3px;
      }

      .meta-line {
        font-size: 11px;
        margin: 1px 0;
        word-break: break-all;
      }

      .footer {
        font-size: 11px;
        margin-top: 10px;
      }
    </style>
  </head>
  <body>
    <div class="check">
      <div class="check-inner">
        <div class="check-title">SAMPI MEDLINE</div>

        <div class="divider"></div>

        <div class="text">Bemor: ${escapeHtml(check.patient?.fullName || "-")}</div>
        <div class="text">Sana: ${escapeHtml(formatCheckDate(check.createdAt))}</div>

        <div class="divider"></div>

        ${
          medicineRows
            ? `
              <div class="section-title">Dorilar</div>
              <div class="divider"></div>
              ${medicineRows}
              <div class="divider"></div>
            `
            : ""
        }

        ${
          serviceRows
            ? `
              <div class="section-title">Xizmatlar</div>
              <div class="divider"></div>
              ${serviceRows}
              <div class="divider"></div>
            `
            : ""
        }

        <div class="jami">
          <span>Jami:</span>
          <span>${escapeHtml(formatNumber(check.total))} so'm</span>
        </div>

        <div class="divider"></div>
        <div class="meta-line">Chek: ${escapeHtml(check.checkId)}</div>
        <div class="meta-line">Xodim: ${escapeHtml(check.createdBy?.name || "-")}</div>
        <div class="footer">Doimo sog'-salomat bo'ling</div>
      </div>
    </div>

    <script>
      let didPrint = false;
      function runPrint() {
        if (didPrint) return;
        didPrint = true;
        window.print();
      }

      window.onload = function () {
        setTimeout(runPrint, 180);
      };

      document.addEventListener("keydown", function (event) {
        if (event.key === "Enter") {
          event.preventDefault();
          runPrint();
        }
      });

      window.onafterprint = function () {
        if (window.opener && !window.opener.closed) {
          window.opener.focus();
        }
        window.close();
      };
    </script>
  </body>
</html>`;
};

export const openPendingPrintTab = () => {
  const printTab = window.open("about:blank", "_blank");
  if (!printTab) return null;

  printTab.document.open();
  printTab.document.write(
    "<!doctype html><html><head><title>Chek tayyorlanmoqda...</title><style>@import url(\"https://fonts.googleapis.com/css2?family=Golos+Text:wght@400;500;600;700;800;900&display=swap\");</style></head><body style='font-family: \"Golos Text\", Arial, sans-serif; padding: 16px;'>Chek tayyorlanmoqda...</body></html>"
  );
  printTab.document.close();
  return printTab;
};

export const writeCheckToPrintTab = (printTab, check) => {
  if (!printTab || printTab.closed) return false;

  printTab.document.open();
  printTab.document.write(buildCheckPrintHtml(check));
  printTab.document.close();
  return true;
};

export const closePrintTab = (printTab) => {
  if (printTab && !printTab.closed) {
    printTab.close();
  }
};
