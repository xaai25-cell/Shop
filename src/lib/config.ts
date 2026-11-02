// Public, non-secret store configuration (safe to use in client components).
export const siteConfig = {
  name: process.env.NEXT_PUBLIC_STORE_NAME || "Xahi Store",
  description: "Shop the latest products with fast island-wide delivery.",
  url: process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
  currency: process.env.NEXT_PUBLIC_CURRENCY || "MVR",
  contactPhone: process.env.NEXT_PUBLIC_CONTACT_PHONE || "",
  bank: {
    name: process.env.NEXT_PUBLIC_BANK_NAME || "Bank of Maldives",
    accountName: process.env.NEXT_PUBLIC_BANK_ACCOUNT_NAME || "",
    accountNumber: process.env.NEXT_PUBLIC_BANK_ACCOUNT_NUMBER || "",
  },
} as const;

export const PAGE_SIZE = 12;
export const LOW_STOCK_THRESHOLD = 5;
