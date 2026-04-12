export const storageKeys = {
  token: "sampi_token",
  user: "sampi_user",
  lorIdentity: "sampi_lor_identity"
};

export const roleHomePath = {
  nurse: "/nurse",
  lor: "/lor/select",
  delivery: "/delivery",
  manager: "/manager",
  cashier: "/cashier/nurse-patients"
};

export const roleLabels = {
  nurse: "Hamshira",
  lor: "LOR shifokor",
  delivery: "Yetkazuvchi",
  manager: "Menejer",
  cashier: "Kassir"
};

export const sidebarMenus = {
  nurse: [
    { label: "Dorilar va xizmatlar tanlash", path: "/nurse", end: true, icon: "grid" },
    { label: "Hamshiralarni boshqarish", path: "/nurse/specialists", end: true, icon: "users" },
    { label: "Dori qo'shish", path: "/nurse/medicines", icon: "pill" },
    { label: "Xizmat qo'shish", path: "/nurse/services", icon: "stethoscope" }
  ],
  lor: [
    { label: "Mening cheklarim", path: "/lor/checks", end: true, icon: "receipt" },
    { label: "Xizmatdan foydalanish", path: "/lor/services", end: true, icon: "stethoscope" },
    { label: "Doktorlarni boshqarish", path: "/lor/specialists", end: true, icon: "users" },
    { label: "Xizmat qo'shish", path: "/lor/services/add", end: true, icon: "plus" }
  ],
  delivery: [{ label: "Yetkazuvchi paneli", path: "/delivery", end: true, icon: "truck" }],
  cashier: [
    { label: "Nurse bemor qo'shish", path: "/cashier/nurse-patients", end: true, group: "Nurse bo'limi", icon: "user-plus" },
    { label: "Nurse yozuvlari", path: "/cashier/nurse-entries", end: true, group: "Nurse bo'limi", icon: "list" },
    { label: "Nurse tarixi", path: "/cashier/nurse-history", end: true, group: "Nurse bo'limi", icon: "history" },
    { label: "Nurse shifokorlar", path: "/cashier/nurse-specialists", end: true, group: "Nurse bo'limi", icon: "users" },
    { label: "LOR bemor qo'shish", path: "/cashier/lor-patients", end: true, group: "LOR bo'limi", icon: "user-plus" },
    { label: "LOR yozuvlari", path: "/cashier/lor-entries", end: true, group: "LOR bo'limi", icon: "list" },
    { label: "LOR tarixi", path: "/cashier/lor-history", end: true, group: "LOR bo'limi", icon: "history" },
    { label: "LOR shifokorlar", path: "/cashier/lor-specialists", end: true, group: "LOR bo'limi", icon: "users" },
    { label: "Kassa jurnali", path: "/cashier/journal", end: true, group: "Umumiy", icon: "receipt" }
  ],
  manager: [
    { label: "Umumiy statistika", path: "/manager", end: true, icon: "bar-chart" },
    { label: "Ombor qoldiqlari", path: "/manager/stock", icon: "box" },
    { label: "Ko'p ishlatilgan dorilar", path: "/manager/most-used", icon: "trending" },
    { label: "Dori sarfi tarixi", path: "/manager/usage-history", icon: "history" }
  ]
};
