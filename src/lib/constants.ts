export const ORDER_STATUSES = ["pending", "slip_uploaded", "approved", "delivered", "rejected"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const STATUS_META: Record<OrderStatus, { label: string; className: string; dot: string; description: string }> = {
  pending: {
    label: "Pending",
    className: "bg-amber-50 text-amber-700 ring-amber-200",
    dot: "bg-amber-500",
    description: "Waiting for payment slip",
  },
  slip_uploaded: {
    label: "Slip uploaded",
    className: "bg-sky-50 text-sky-700 ring-sky-200",
    dot: "bg-sky-500",
    description: "Payment is being verified",
  },
  approved: {
    label: "Approved",
    className: "bg-violet-50 text-violet-700 ring-violet-200",
    dot: "bg-violet-500",
    description: "Payment confirmed, preparing your order",
  },
  delivered: {
    label: "Delivered",
    className: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    dot: "bg-emerald-500",
    description: "Order delivered",
  },
  rejected: {
    label: "Rejected",
    className: "bg-rose-50 text-rose-700 ring-rose-200",
    dot: "bg-rose-500",
    description: "Order was rejected",
  },
};

/** Allowed admin transitions (mirrors public.set_order_status in SQL). */
export const ADMIN_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ["approved", "rejected"],
  slip_uploaded: ["approved", "rejected", "pending"],
  approved: ["delivered", "rejected"],
  delivered: [],
  rejected: [],
};

export const SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "price_asc", label: "Price: Low to High" },
  { value: "price_desc", label: "Price: High to Low" },
  { value: "name", label: "Name A–Z" },
] as const;
