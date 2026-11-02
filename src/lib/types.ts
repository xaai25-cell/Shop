import type { OrderStatus } from "./constants";

export type Category = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  color: string;
  image_path: string | null;
  sort_order: number;
  is_active: boolean;
};

export type Swatch = { color: string; hex: string };

export type ProductListing = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  base_price: number;
  compare_at_price: number | null;
  is_active: boolean;
  is_featured: boolean;
  created_at: string;
  category_id: string | null;
  category_slug: string | null;
  category_name: string | null;
  min_price: number;
  max_price: number;
  total_stock: number;
  colors: string[];
  sizes: string[];
  swatches: Swatch[] | null;
  image_paths: string[] | null;
};

export type ProductImage = {
  id: string;
  product_id: string;
  path: string;
  alt: string | null;
  color: string | null;
  width: number | null;
  height: number | null;
  sort_order: number;
};

export type ProductVariant = {
  id: string;
  product_id: string;
  sku: string | null;
  color: string | null;
  color_hex: string | null;
  size: string | null;
  price: number | null;
  stock: number;
  is_active: boolean;
  sort_order: number;
};

export type Product = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category_id: string | null;
  base_price: number;
  compare_at_price: number | null;
  is_active: boolean;
  is_featured: boolean;
  created_at: string;
  category?: Pick<Category, "id" | "name" | "slug" | "color"> | null;
  images: ProductImage[];
  variants: ProductVariant[];
};

export type OrderItem = {
  id: string;
  product_id: string | null;
  variant_id: string | null;
  product_name: string;
  variant_label: string | null;
  image_path: string | null;
  unit_price: number;
  quantity: number;
  line_total: number;
};

export type Order = {
  id: string;
  order_number: string;
  customer_name: string;
  phone: string;
  email: string | null;
  address: string;
  island: string;
  notes: string | null;
  subtotal: number;
  delivery_fee: number;
  total: number;
  status: OrderStatus;
  receipt_path: string | null;
  receipt_uploaded_at: string | null;
  admin_note: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
  items?: OrderItem[];
};

export type OrderHistory = {
  id: number;
  from_status: OrderStatus | null;
  to_status: OrderStatus;
  note: string | null;
  created_at: string;
};

export type ActionResult<T = undefined> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> };
