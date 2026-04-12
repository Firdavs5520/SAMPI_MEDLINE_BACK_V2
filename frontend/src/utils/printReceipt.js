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

const resolveItemType = (item, checkType) => {
  const fromItem = String(item?.itemType || "").toLowerCase();
  if (fromItem) return fromItem;
  const fromCheck = String(checkType || "").toLowerCase();
  if (fromCheck === "medicine" || fromCheck === "service") return fromCheck;
  return "";
};

const buildItemRows = (items, itemType, checkType) => {
  return (items || [])
    .filter((item) => resolveItemType(item, checkType) === itemType)
    .map((item) => {
      const quantity = Number(item.quantity) || 0;
      const unitPrice = Number(item.price) || 0;
      const lineTotal = unitPrice * quantity;
      const line = `${escapeHtml(item.name)} x${escapeHtml(quantity)}`;
      return `<div class="row"><span class="name">${line}</span><span class="price">${escapeHtml(formatNumber(lineTotal))} so'm</span></div>`;
    })
    .join("");
};

const buildCheckPrintHtml = (check, options = {}) => {
  const { inline = false } = options;
  const medicineRows = buildItemRows(check.items, "medicine", check.type);
  const serviceRows = buildItemRows(check.items, "service", check.type);

  const medicineSection =
    medicineRows.length > 0
      ? `<div class="section-title">Dorilar</div><div class="divider"></div>${medicineRows}<div class="divider"></div>`
      : "";

  const serviceSection =
    serviceRows.length > 0
      ? `<div class="section-title">Xizmatlar</div><div class="divider"></div>${serviceRows}<div class="divider"></div>`
      : "";
  const creatorRole = String(check?.createdBy?.role || "").toLowerCase();
  const specialistLine =
    creatorRole === "nurse"
      ? `<div class="nurse-line">Hamshira: ${escapeHtml(check?.createdBy?.name || "-")}</div>`
      : creatorRole === "lor"
        ? `<div class="nurse-line">Doktor: ${escapeHtml(check?.createdBy?.name || "-")}</div>
           <div class="nurse-line">LOR: ${escapeHtml(
             String(check?.createdBy?.lorIdentity || "-")
               .toUpperCase()
               .replace("LOR", "LOR-")
           )}</div>`
        : "";

  return `<!doctype html>
<html lang="uz">
  <head>
    <meta charset="UTF-8" />
    <title>Chek</title>
    <style>
      @import url("https://fonts.googleapis.com/css2?family=Golos+Text:wght@400;500;600;700;800;900&display=swap");

      @page { size: 58mm auto; margin: 0; }
      html, body {
        margin: 0;
        padding: 0;
        width: 58mm;
        font-family: "Golos Text", sans-serif;
        font-size: 12px;
        color: #000;
        background: #fff;
      }

      * {
        font-family: "Golos Text", sans-serif;
      }

      .ticket { width: 58mm; margin: 0; padding: 0; }
      .inner { width: 48mm; margin: 0 auto; padding: 6px 0; }
      .check-title {
        text-align: center;
        font-size: 14px;
        font-weight: 800;
        letter-spacing: 0;
        text-transform: uppercase;
        white-space: nowrap;
      }
      .divider {
        border-top: 2px dashed #000;
        margin: 6px 0;
      }
      .text {
        text-align: center;
        font-size: 15px;
        margin: 2px 0;
      }
      .section-title {
        text-align: center;
        font-size: 16px;
        font-weight: 800;
      }
      .row {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 6px;
        font-size: 15px;
        margin: 2px 0;
      }
      .name {
        flex: 1;
        min-width: 0;
        word-break: break-word;
        text-align: left;
      }
      .price {
        white-space: nowrap;
        font-weight: 700;
      }
      .jami {
        display: flex;
        justify-content: space-between;
        font-size: 17px;
        font-weight: 800;
      }
      .nurse-line { margin-top: 8px; text-align: center; font-size: 14px; font-weight: 700; }
      .footer {
        margin-top: 8px;
        text-align: center;
        font-size: 14px;
      }
    </style>
  </head>
  <body>
    <div class="ticket">
      <div class="inner">
        <div class="check-title">SAMPI MEDLINE</div>

        <div class="divider"></div>

        <div class="text">Bemor: ${escapeHtml(check.patient?.fullName || "-")}</div>
        <div class="text">Sana: ${escapeHtml(formatCheckDate(check.createdAt))}</div>

        <div class="divider"></div>
        ${medicineSection}
        ${serviceSection}

        <div class="jami">
          <span>Jami:</span>
          <span>${escapeHtml(formatNumber(check.total))} so'm</span>
        </div>
        <div class="divider"></div>

        <div class="footer">Doimo sog'-salomat bo'ling</div>
        ${specialistLine}
      </div>
    </div>
    ${
      inline
        ? ""
        : `<script>
      let didPrint = false;

      function runPrint() {
        if (didPrint) return;
        didPrint = true;
        window.print();
      }

      window.onload = function () {
        const startPrint = function () {
          setTimeout(runPrint, 120);
        };
        if (document.fonts && document.fonts.ready) {
          document.fonts.ready.then(startPrint).catch(startPrint);
        } else {
          startPrint();
        }
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
    </script>`
    }
  </body>
</html>`;
};

const isStandalonePwa = () => {
  try {
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true ||
      document.referrer.startsWith("android-app://")
    );
  } catch (error) {
    return false;
  }
};

const openInlinePrintSession = () => ({
  __inlinePrint: true
});

const openBrowserPrintTab = () => {
  const printTab = window.open("about:blank", "_blank");
  if (!printTab) return null;

  printTab.document.open();
  printTab.document.write(
    "<!doctype html><html><head><title>Chek tayyorlanmoqda...</title><style>@import url('https://fonts.googleapis.com/css2?family=Golos+Text:wght@400;500;600;700;800;900&display=swap');body{font-family:'Golos Text',sans-serif;font-size:16px;font-weight:700;padding:12px;}</style></head><body>Chek tayyorlanmoqda...</body></html>"
  );
  printTab.document.close();
  return {
    __inlinePrint: false,
    tab: printTab
  };
};

const printInsideCurrentApp = (check) => {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.style.opacity = "0";
  document.body.appendChild(iframe);

  const frameWindow = iframe.contentWindow;
  const frameDocument = frameWindow?.document;
  if (!frameWindow || !frameDocument) {
    iframe.remove();
    return false;
  }

  const cleanup = () => {
    setTimeout(() => {
      if (iframe.parentNode) {
        iframe.parentNode.removeChild(iframe);
      }
    }, 100);
  };

  frameWindow.addEventListener("afterprint", cleanup, { once: true });
  setTimeout(cleanup, 60000);

  frameDocument.open();
  frameDocument.write(buildCheckPrintHtml(check, { inline: true }));
  frameDocument.close();

  const startPrint = () => {
    setTimeout(() => {
      try {
        frameWindow.focus();
        frameWindow.print();
      } catch (error) {
        cleanup();
      }
    }, 120);
  };

  if (frameDocument.fonts && frameDocument.fonts.ready) {
    frameDocument.fonts.ready.then(startPrint).catch(startPrint);
  } else {
    startPrint();
  }

  return true;
};

export const openPendingPrintTab = () => {
  if (isStandalonePwa()) {
    return openInlinePrintSession();
  }

  return openBrowserPrintTab();
};

export const writeCheckToPrintTab = (printSession, check) => {
  if (!printSession) return false;

  if (printSession.__inlinePrint) {
    return printInsideCurrentApp(check);
  }

  if (!printSession.tab || printSession.tab.closed) return false;

  printSession.tab.document.open();
  printSession.tab.document.write(buildCheckPrintHtml(check));
  printSession.tab.document.close();
  return true;
};

export const closePrintTab = (printSession) => {
  if (!printSession || printSession.__inlinePrint) return;
  if (printSession.tab && !printSession.tab.closed) {
    printSession.tab.close();
  }
};
