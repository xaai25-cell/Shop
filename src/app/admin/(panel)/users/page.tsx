import { requireRole } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/admin";
import { UserManager, type ManagedUser } from "@/components/admin/user-manager";

export const metadata = { title: "Users" };
export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const { user: me } = await requireRole("admin");
  const service = createServiceClient();

  const [{ data: authData, error }, { data: profiles }] = await Promise.all([
    service.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    service.from("profiles").select("id, role, full_name"),
  ]);

  if (error) {
    return <p className="text-rose-600">Could not load users: {error.message}</p>;
  }

  const byId = new Map(
    ((profiles ?? []) as { id: string; role: string; full_name: string | null }[]).map((p) => [p.id, p]),
  );
  const order = { admin: 0, manager: 1, staff: 2, customer: 3 } as Record<string, number>;

  const users: ManagedUser[] = (authData?.users ?? [])
    .map((u) => {
      const p = byId.get(u.id);
      return {
        id: u.id,
        email: u.email ?? "",
        full_name: p?.full_name || (u.user_metadata?.full_name as string | undefined) || "",
        role: (p?.role ?? "customer") as ManagedUser["role"],
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at ?? null,
        confirmed: !!u.email_confirmed_at,
      };
    })
    .sort((a, b) => (order[a.role] ?? 9) - (order[b.role] ?? 9) || a.email.localeCompare(b.email));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Users</h1>
        <p className="text-sm text-slate-500">Create accounts for your team and choose what each person can do.</p>
      </div>
      <UserManager users={users} currentUserId={me.id} />
    </div>
  );
}
