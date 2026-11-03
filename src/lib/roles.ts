// Shared (client + server) role definitions. Mirrors public.is_staff / is_manager / is_admin in SQL.

export const STAFF_ROLES = ["staff", "manager", "admin"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];
export type Role = StaffRole | "customer";

const RANK: Record<Role, number> = { customer: 0, staff: 1, manager: 2, admin: 3 };

export function hasRole(role: Role | null | undefined, min: StaffRole) {
  return !!role && RANK[role] >= RANK[min];
}

export const ROLE_META: Record<StaffRole, { label: string; description: string; className: string }> = {
  admin: {
    label: "Admin",
    description: "Full access, including creating and managing users",
    className: "bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200",
  },
  manager: {
    label: "Manager",
    description: "Everything except managing users: orders, payments, products, categories, statistics",
    className: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  },
  staff: {
    label: "Staff",
    description: "View and edit products and categories",
    className: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  },
};

/** Where each role lands after signing in. */
export function homeFor(role: StaffRole) {
  return hasRole(role, "manager") ? "/admin" : "/admin/products";
}
