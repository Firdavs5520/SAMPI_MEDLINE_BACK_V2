import { formatCurrency, formatDateTime } from "../utils/format.js";

function PrintReceipt({ check }) {
  if (!check) return null;

  return (
    <div className="print-area mx-auto w-[58mm] bg-white p-0 text-black font-golos">
      <div className="mx-auto w-[48mm] py-2 font-golos">
        <div className="text-center text-[20px] font-bold leading-tight ">
          Sampi Medline
        </div>
        <div className="mt-1 border-t-2 border-black" />

        <div className="mt-2 space-y-1 text-[18px] font-bold font-golos">
          <div>Bemor: {check.patient?.fullName || "-"}</div>
          <div>Sana: {formatDateTime(check.createdAt)}</div>
        </div>

        <div className="mt-2 border-t-2 border-black" />

        <div className="mt-2 space-y-2">
          {check.items?.map((item, idx) => (
            <div key={`${item.name}-${idx}`} className="border-b border-dashed border-black pb-1">
              <div className="flex items-baseline justify-between gap-2">
                <div className="min-w-0 flex-1 break-words text-[18px] font-bold leading-tight font-golos">
                  {item.name}
                </div>
                <div className="whitespace-nowrap text-[17px] font-extrabold font-golos">x{item.quantity}</div>
              </div>
              <div className="mt-1 text-right text-[18px] font-extrabold font-golos">
                {formatCurrency(item.price * item.quantity)} so'm
              </div>
            </div>
          ))}
        </div>

        <div className="mt-2 border-y-2 border-black py-1">
          <div className="flex justify-between text-[23px] font-black leading-tight font-golos">
            <span>Jami</span>
            <span>{formatCurrency(check.total)} so'm</span>
          </div>
        </div>

      </div>
    </div>
  );
}

export default PrintReceipt;
