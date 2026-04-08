export const formatCurrency = (amount) => {
  const safeAmount = Number.isFinite(Number(amount)) ? Number(amount) : 0;
  return safeAmount.toLocaleString("uz-UZ");
};

export const formatMoneyInput = (value, maxDigits = 6) => {
  const digits = String(value ?? "")
    .replace(/\D/g, "")
    .slice(0, maxDigits);

  if (!digits) return "";
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
};

export const parseMoneyInput = (value) => {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return 0;
  return Number(digits);
};

export const toTitleCaseName = (value) =>
  String(value ?? "")
    .toLocaleLowerCase("uz-UZ")
    .replace(/\s{2,}/g, " ")
    .replace(/(^|\s)(\p{L})/gu, (full, space, letter) => {
      return `${space}${letter.toLocaleUpperCase("uz-UZ")}`;
    });

export const splitFullName = (value) => {
  const fullName = toTitleCaseName(value).trim();
  if (!fullName) {
    return { firstName: "", lastName: "", fullName: "" };
  }

  const parts = fullName.split(/\s+/).filter(Boolean);
  if (parts.length < 2) {
    return {
      firstName: parts[0] || "",
      lastName: "",
      fullName
    };
  }

  const [firstName, ...rest] = parts;
  return {
    firstName,
    lastName: rest.join(" "),
    fullName
  };
};

export const formatPhoneInput = (value) => {
  let digits = String(value ?? "").replace(/\D/g, "");
  if (digits.startsWith("998")) {
    digits = digits.slice(3);
  }

  digits = digits.slice(0, 9);

  const p1 = digits.slice(0, 2);
  const p2 = digits.slice(2, 5);
  const p3 = digits.slice(5, 7);
  const p4 = digits.slice(7, 9);

  return [p1, p2, p3, p4].filter(Boolean).join(" ");
};

export const formatDateTime = (date) => {
  if (!date) return "-";
  const safeDate = new Date(date);
  if (Number.isNaN(safeDate.getTime())) return "-";
  return safeDate.toLocaleString("uz-UZ");
};

export const extractErrorMessage = (error) =>
  error?.message || "Noma'lum xatolik yuz berdi";
