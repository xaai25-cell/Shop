import { z } from "zod";
import { ORDER_STATUSES } from "./constants";

const trimmed = (min: number, max: number, label: string) =>
  z.string().trim().min(min, `${label} is required`).max(max, `${label} is too long`);

export const phoneSchema = z
  .string()
  .transform((v) => v.replace(/[\s\-()]/g, ""))
  .pipe(z.string().regex(/^\+?[0-9]{7,15}$/, "Enter a valid phone number"));

export const checkoutSchema = z.object({
  customer_name: trimmed(2, 120, "Name"),
  phone: phoneSchema,
  email: z.union([z.literal(""), z.string().trim().email("Enter a valid email").max(200)]).optional(),
  address: trimmed(3, 300, "Address"),
  island: trimmed(2, 80, "Island / City"),
  notes: z.string().trim().max(500).optional(),
  website: z.string().max(0).optional(), // honeypot – must stay empty
  items: z
    .array(z.object({ variant_id: z.string().uuid(), quantity: z.number().int().min(1).max(20) }))
    .min(1, "Your cart is empty")
    .max(50),
});
export type CheckoutInput = z.input<typeof checkoutSchema>;

export const orderLookupSchema = z.object({
  order_number: z.string().trim().toUpperCase().regex(/^ORD-\d{6}-[A-F0-9]{6}$/, "Invalid order number"),
  phone: phoneSchema,
});

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #ff6600");
const slug = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and dashes")
  .max(80);

const money = z.coerce.number().min(0).max(10_000_000).multipleOf(0.01);
const optionalMoney = z.preprocess((v) => (v === "" || v === null || v === undefined ? null : v), money.nullable());
const optionalText = (max: number) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), z.string().trim().max(max).nullable());

export const variantSchema = z.object({
  id: z.string().uuid().optional(),
  sku: optionalText(64),
  color: optionalText(40),
  color_hex: z.preprocess((v) => (v === "" ? null : v), hex.nullable()),
  size: optionalText(20),
  price: optionalMoney,
  stock: z.coerce.number().int().min(0).max(1_000_000),
  is_active: z.boolean(),
});

export const productSchema = z.object({
  name: trimmed(1, 160, "Name"),
  slug,
  description: optionalText(5000),
  category_id: z.preprocess((v) => (v === "" ? null : v), z.string().uuid().nullable()),
  base_price: money,
  compare_at_price: optionalMoney,
  is_active: z.boolean(),
  is_featured: z.boolean(),
  variants: z.array(variantSchema).min(1, "Add at least one variant").max(100),
});
/** Shape sent by the admin form (strings straight from inputs; the schema coerces). */
export type ProductInput = {
  name: string;
  slug: string;
  description: string;
  category_id: string;
  base_price: string | number;
  compare_at_price: string | number;
  is_active: boolean;
  is_featured: boolean;
  variants: {
    id?: string;
    sku: string;
    color: string;
    color_hex: string;
    size: string;
    price: string | number;
    stock: string | number;
    is_active: boolean;
  }[];
};

export const categorySchema = z.object({
  id: z.string().uuid().optional(),
  name: trimmed(1, 80, "Name"),
  slug,
  description: optionalText(500),
  color: hex,
  sort_order: z.coerce.number().int().min(0).max(10_000),
  is_active: z.boolean(),
});

export type CategoryInput = {
  id?: string;
  name: string;
  slug: string;
  description: string;
  color: string;
  sort_order: string | number;
  is_active: boolean;
};

export const statusChangeSchema = z.object({
  order_id: z.string().uuid(),
  status: z.enum(ORDER_STATUSES),
  note: z.string().trim().max(500).optional(),
});
