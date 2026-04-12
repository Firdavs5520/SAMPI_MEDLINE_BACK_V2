import Button from "./Button.jsx";
import Modal from "./Modal.jsx";
import { formatCurrency, formatDateTime } from "../utils/format.js";

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const getItemType = (item, checkType) => String(item?.itemType || checkType || "").toLowerCase();
const getItemsByType = (check, type) =>
  (check?.items || []).filter((item) => getItemType(item, check.type) === type);
const getLineTotal = (item) => (Number(item?.price) || 0) * (Number(item?.quantity) || 0);
const formatLorIdentity = (value) => {
  const raw = String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const match = raw.match(/lor(\d+)/);
  if (match) return `Lor-${match[1]}`;
  if (!raw) return "-";
  return String(value || "-");
};

const buildRowsHtml = (items, checkType) =>
  items
    .map((item) => {
      const line = `${escapeHtml(item.name)} x${escapeHtml(item.quantity)}`;
      const amount = escapeHtml(formatCurrency(getLineTotal(item)));
      return `<div class="row"><span class="name">${line}</span><span class="price">${amount}</span></div>`;
    })
    .join("");

const buildPrintHtml = (check) => {
  const medicineItems = getItemsByType(check, "medicine");
  const serviceItems = getItemsByType(check, "service");

  const medicineSection =
    medicineItems.length > 0
      ? `<div class="section-title">Dorilar</div><div class="divider"></div>${buildRowsHtml(medicineItems, check.type)}<div class="divider"></div>`
      : "";

  const serviceSection =
    serviceItems.length > 0
      ? `<div class="section-title">Xizmatlar</div><div class="divider"></div>${buildRowsHtml(serviceItems, check.type)}<div class="divider"></div>`
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
        font-size: 13px;
        color: #000;
        background: #fff;
      }

      .ticket { width: 58mm; margin: 0; padding: 0; }
      .inner { width: 48mm; margin: 0 auto; padding: 6px 0; }
      .check-title {
        text-align: center;
        font-size: 30px;
        font-weight: 900;
        letter-spacing: 0.5px;
        text-transform: uppercase;
      }
      .divider {
        border-top: 4px dashed #000;
        margin: 1px 0;
      }
      .text {
        text-align: center;
        font-size: 16px;
        margin: 2px 0;
      }
      .section-title {
        text-align: center;
        font-size: 18px;
        font-weight: 800;
      }
      .row {
        display: flex;
        justify-content: space-between;
        gap: 6px;
        font-size: 16px;
        margin: 2px 0;
      }
      .name {
        max-width: 38mm;
        word-break: break-word;
        text-align: left;
      }
      .price {
        white-space: nowrap;
        font-weight: 600;
      }
      .jami {
        display: flex;
        justify-content: space-between;
        font-size: 16px;
        font-weight: 800;
      }
      .meta {
        font-size: 14px;
        line-height: 1.35;
      }
      .footer {
        margin-top: 10px;
        text-align: center;
        font-size: 15px;
      }

      .help {
        margin-bottom: 6px;
        padding: 2px;
        border: 1px dashed #555;
        text-align: center;
        font-size: 11px;
      }
      .print-btn {
        margin-top: 6px;
        width: 100%;
        border: 1px solid #111;
        background: #fff;
        padding: 6px 8px;
        font-family: "Golos Text", sans-serif;
        font-size: 12px;
        cursor: pointer;
      }
    </style>
  </head>
  <body>
    <div class="ticket">
      <div class="inner">
        <div class="help">Chop etish uchun Enter tugmasini bosing</div>
        <div class="check-title">SAMPI MEDLINE</div>
        <div class="divider"></div>

        <div class="text">Bemor: ${escapeHtml(check.patient?.fullName || "-")}</div>
        <div class="text">Sana: ${escapeHtml(formatDateTime(check.createdAt))}</div>
        ${
          String(check?.createdBy?.role || "").toLowerCase() === "lor"
            ? `<div class="text">${escapeHtml(formatLorIdentity(check?.createdBy?.lorIdentity))}</div>`
            : ""
        }

        <div class="divider"></div>
        ${medicineSection}
        ${serviceSection}

        <div class="jami">
          <span>Jami:</span>
          <span>${escapeHtml(formatCurrency(check.total))}</span>
        </div>
        <div class="divider"></div>

        ${
          String(check?.createdBy?.role || "").toLowerCase() === "nurse"
            ? `<div class="meta"><div>Hamshira: ${escapeHtml(check.createdBy?.name || "-")}</div></div>`
            : String(check?.createdBy?.role || "").toLowerCase() === "lor"
              ? `<div class="meta"><div>${escapeHtml(check.createdBy?.name || "-")}</div></div>`
              : ""
        }
        <div class="footer">Doimo sog'-salomat bo'ling</div>
        <button id="printBtn" class="print-btn">Chop etish (Enter tugmasi)</button>
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
        window.focus();
      };

      document.addEventListener("keydown", function (event) {
        if (event.key === "Enter") {
          event.preventDefault();
          runPrint();
        }
      });

      const printBtn = document.getElementById("printBtn");
      if (printBtn) {
        printBtn.addEventListener("click", runPrint);
      }

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

function CheckModal({ open, check, onClose }) {
  if (!check) return null;

  const medicineItems = getItemsByType(check, "medicine");
  const serviceItems = getItemsByType(check, "service");

  const handlePrint = () => {
    const printWindow = window.open("", "_blank");

    if (!printWindow) {
      return;
    }

    printWindow.document.open();
    printWindow.document.write(buildPrintHtml(check));
    printWindow.document.close();

    onClose?.();
  };

  return (
    <Modal
      open={open}
      title="Chek"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" className="w-full sm:w-auto" onClick={onClose}>
            Yopish
          </Button>
          <Button variant="accent" className="w-full sm:w-auto" onClick={handlePrint}>
            Chop etish (yangi oyna)
          </Button>
        </>
      }
    >
      <div className="space-y-4 font-golos">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 font-golos">
          <h4 className="text-center text-2xl font-black uppercase tracking-wide text-slate-800">
            SAMPI MEDLINE
          </h4>
          <div className="mt-3 border-t border-dashed border-slate-300" />

          <div className="mt-3 space-y-1 text-base text-slate-700">
            <p className="text-center">Bemor: {check.patient?.fullName || "-"}</p>
            <p className="text-center">Sana: {formatDateTime(check.createdAt)}</p>
            {String(check?.createdBy?.role || "").toLowerCase() === "lor" ? (
              <p className="text-center">{formatLorIdentity(check?.createdBy?.lorIdentity)}</p>
            ) : null}
          </div>

          <div className="mt-3 border-t border-dashed border-slate-300" />

          {medicineItems.length > 0 ? (
            <div className="mt-3">
              <p className="text-center text-lg font-bold text-slate-800">Dorilar</p>
              <div className="mt-2 border-t border-dashed border-slate-300" />
              <div className="mt-2 space-y-1">
                {medicineItems.map((item, idx) => (
                  <div
                    key={`medicine-${item.name}-${idx}`}
                    className="flex items-start justify-between gap-2 text-base"
                  >
                    <span className="max-w-[75%] break-words text-slate-700">
                      {item.name} x{item.quantity}
                    </span>
                    <span className="font-semibold text-slate-900">
                      {formatCurrency(getLineTotal(item))}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-2 border-t border-dashed border-slate-300" />
            </div>
          ) : null}

          {serviceItems.length > 0 ? (
            <div className="mt-3">
              <p className="text-center text-lg font-bold text-slate-800">Xizmatlar</p>
              <div className="mt-2 border-t border-dashed border-slate-300" />
              <div className="mt-2 space-y-1">
                {serviceItems.map((item, idx) => (
                  <div
                    key={`service-${item.name}-${idx}`}
                    className="flex items-start justify-between gap-2 text-base"
                  >
                    <span className="max-w-[75%] break-words text-slate-700">
                      {item.name} x{item.quantity}
                    </span>
                    <span className="font-semibold text-slate-900">
                      {formatCurrency(getLineTotal(item))}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-2 border-t border-dashed border-slate-300" />
            </div>
          ) : null}

          <div className="mt-3 border-t border-dashed border-slate-300 pt-2">
            <div className="flex items-center justify-between text-xl font-bold text-slate-900">
              <span>Jami:</span>
              <span>{formatCurrency(check.total)}</span>
            </div>
          </div>

          {String(check?.createdBy?.role || "").toLowerCase() === "nurse" ? (
            <p className="mt-1 text-center text-sm font-semibold text-slate-700">
              Hamshira: {check.createdBy?.name || "-"}
            </p>
          ) : String(check?.createdBy?.role || "").toLowerCase() === "lor" ? (
            <>
              <p className="mt-1 text-center text-sm font-semibold text-slate-700">
                {check.createdBy?.name || "-"}
              </p>
            </>
          ) : null}
          <p className="mt-4 text-center text-base text-slate-700">
            Doimo sog'-salomat bo'ling
          </p>
        </div>
      </div>
    </Modal>
  );
}

export default CheckModal;
