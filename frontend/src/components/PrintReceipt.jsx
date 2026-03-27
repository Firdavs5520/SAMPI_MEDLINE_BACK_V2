import { formatCurrency, formatDateTime } from "../utils/format.js";

function PrintReceipt({ check }) {
  if (!check) return null;

  return (
    <div className="print-area mx-auto w-[58mm] bg-white p-0 text-[12px] text-black">
      <div className="mx-auto w-[48mm] py-2">
        <div className="text-center font-bold">Sampi Medline</div>
        <div className="mt-1 border-t border-dashed border-black" />

        <div className="mt-2 space-y-1">
          {check.items?.map((item, idx) => (
            <div key={`${item.name}-${idx}`} className="flex justify-between gap-2">
              <div className="flex-1 truncate">
                [{item.itemType || check.type}] {item.name} x{item.quantity}
              </div>
              <div>{formatCurrency(item.price * item.quantity)}</div>
            </div>
          ))}
        </div>

        <div className="mt-2 border-t border-dashed border-black pt-1">
          <div className="flex justify-between font-bold">
            <span>Jami</span>
            <span>{formatCurrency(check.total)}</span>
          </div>
        </div>

        <div className="mt-2 border-t border-dashed border-black pt-1 text-[11px]">
          <div>Chek: {check.checkId}</div>
          <div>Bemor: {check.patient?.fullName || "-"}</div>
          <div>Foydalanuvchi: {check.createdBy?.name}</div>
          <div>Rol: {check.createdBy?.role}</div>
          <div>Sana: {formatDateTime(check.createdAt)}</div>
        </div>
      </div>
    </div>
  );
}

export default PrintReceipt;
