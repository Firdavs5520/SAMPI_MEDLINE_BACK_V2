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

const buildCheckPrintHtml = (check, options = {}) => {
  const { inline = false } = options;
  const medicineRows = buildItemRows(check.items, "medicine");
  const serviceRows = buildItemRows(check.items, "service");

  return `<!doctype html>
<html lang="uz">
  <head>
    <meta charset="UTF-8" />
    <title>Chek - ${escapeHtml(check.checkId)}</title>
    <style>
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
        font-family: "Courier New", Courier, monospace;
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
        padding: 1px 0;
      }

      .check-title {
        font-size: 18px;
        font-weight: 900;
        letter-spacing: 0.2px;
        white-space: nowrap;
      }

      .divider {
        border-top: 1px dashed #000;
        margin: 3px 0;
      }

      .text {
        font-size: 13px;
        margin: 1px 0;
      }

      .section-title {
        font-size: 16px;
        font-weight: 700;
        margin-top: 2px;
      }

      .row {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        font-size: 13px;
        margin: 1px 0;
        gap: 1.5mm;
      }

      .row span:first-child {
        flex: 1;
        min-width: 0;
        max-width: 31mm;
        word-break: break-word;
        text-align: left;
      }

      .row span:last-child {
        white-space: nowrap;
      }

      .jami {
        display: flex;
        justify-content: space-between;
        font-size: 15px;
        font-weight: 700;
        margin-top: 3px;
      }

      .footer {
        font-size: 12px;
        margin-top: 6px;
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
        <div class="footer">Doimo sog'-salomat bo'ling</div>
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
        setTimeout(runPrint, 60);
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
    "<!doctype html><html><head><title>Chek tayyorlanmoqda...</title></head><body style='font-family: \"Courier New\", Courier, monospace; padding: 12px;'>Chek tayyorlanmoqda...</body></html>"
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

  setTimeout(() => {
    try {
      frameWindow.focus();
      frameWindow.print();
    } catch (error) {
      cleanup();
    }
  }, 40);

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
