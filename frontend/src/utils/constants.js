export const storageKeys = {
  token: "sampi_token",
  user: "sampi_user",
  lorIdentity: "sampi_lor_identity"
};

export const roleHomePath = {
  nurse: "/nurse",
  lor: "/lor/select",
  delivery: "/delivery",
  manager: "/manager"
};

export const roleLabels = {
  nurse: "Hamshira",
  lor: "LOR shifokor",
  delivery: "Yetkazuvchi",
  manager: "Menejer"
};

export const sidebarMenus = {
  nurse: [
    { label: "Hamshira paneli", path: "/nurse", end: true },
    { label: "Dori qo'shish", path: "/nurse/medicines" },
    { label: "Xizmat qo'shish", path: "/nurse/services" }
  ],
  lor: [
    { label: "LOR tanlash", path: "/lor/select", end: true },
    { label: "Mening cheklarim", path: "/lor/checks", end: true },
    { label: "Xizmatdan foydalanish", path: "/lor/services", end: true },
    { label: "Xizmat qo'shish", path: "/lor/services/add", end: true }
  ],
  delivery: [{ label: "Yetkazuvchi paneli", path: "/delivery", end: true }],
  manager: [
    { label: "Umumiy statistika", path: "/manager", end: true },
    { label: "Ombor qoldiqlari", path: "/manager/stock" },
    { label: "Ko'p ishlatilgan dorilar", path: "/manager/most-used" },
    { label: "Dori sarfi tarixi", path: "/manager/usage-history" }
  ]
};
