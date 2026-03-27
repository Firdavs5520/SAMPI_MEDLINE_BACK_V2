export const formatCurrency = (amount) => {
  const safeAmount = Number.isFinite(Number(amount)) ? Number(amount) : 0;
  return safeAmount.toLocaleString("uz-UZ");
};

export const formatDateTime = (date) => {
  if (!date) return "-";
  const safeDate = new Date(date);
  if (Number.isNaN(safeDate.getTime())) return "-";
  return safeDate.toLocaleString("uz-UZ");
};

export const extractErrorMessage = (error) =>
  error?.message || "Noma'lum xatolik yuz berdi";
