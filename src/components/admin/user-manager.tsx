"use client";

import { useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Eye, EyeOff, KeyRound, ShieldCheck, Trash2, UserPlus, Wand2, X } from "lucide-react";
import { toast } from "sonner";
import { createUser, deleteUser, resetUserPassword, updateUser } from "@/app/admin/user-actions";
import { ROLE_META, type StaffRole } from "@/lib/roles";
import { cn, formatDate } from "@/lib/utils";
import { Badge, Button, Card, Field, Input, Select } from "@/components/ui";

export type ManagedUser = {
  id: string;
  email: string;
  full_name: string;
  role: StaffRole | "customer";
  created_at: string;
  last_sign_in_at: string | null;
  confirmed: boolean;
};

const ROLES: StaffRole[] = ["staff", "manager", "admin"];

function generatePassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  let out = Array.from(bytes, (b) => chars[b % chars.length]).join("");
  if (!/[0-9]/.test(out)) out = out.slice(0, -1) + "7";
  if (!/[A-Za-z]/.test(out)) out = "K" + out.slice(1);
  return out;
}

function RoleBadge({ role }: { role: ManagedUser["role"] }) {
  if (role === "customer") return <Badge className="bg-slate-50 text-slate-500 ring-slate-200">No access</Badge>;
  return <Badge className={ROLE_META[role].className}>{ROLE_META[role].label}</Badge>;
}

export function UserManager({ users, currentUserId }: { users: ManagedUser[]; currentUserId: string }) {
  const [showCreate, setShowCreate] = useState(users.length <= 1);
  const counts = ROLES.map((r) => ({ role: r, n: users.filter((u) => u.role === r).length }));

  return (
    <div className="space-y-6">
      {/* Role guide */}
      <div className="grid gap-3 md:grid-cols-3">
        {[...ROLES].reverse().map((r) => (
          <Card key={r} className="p-4">
            <div className="flex items-center justify-between">
              <Badge className={ROLE_META[r].className}>{ROLE_META[r].label}</Badge>
              <span className="text-xs text-slate-400">{counts.find((c) => c.role === r)?.n ?? 0} users</span>
            </div>
            <p className="mt-2 text-sm text-slate-600">{ROLE_META[r].description}</p>
          </Card>
        ))}
      </div>

      <div className="flex justify-end">
        <Button onClick={() => setShowCreate((v) => !v)} variant={showCreate ? "outline" : "primary"}>
          {showCreate ? <X className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
          {showCreate ? "Close" : "New user"}
        </Button>
      </div>

      <AnimatePresence initial={false}>
        {showCreate && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <CreateUserForm onCreated={() => setShowCreate(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">User</th>
                <th className="px-4 py-3 font-semibold">Access</th>
                <th className="px-4 py-3 font-semibold">Last sign-in</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => (
                <UserRow key={u.id} user={u} isMe={u.id === currentUserId} />
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function CreateUserForm({ onCreated }: { onCreated: () => void }) {
  const [pending, startTransition] = useTransition();
  const [role, setRole] = useState<StaffRole>("staff");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setError(null);
    startTransition(async () => {
      const res = await createUser({
        email: String(fd.get("email") ?? ""),
        full_name: String(fd.get("full_name") ?? ""),
        password,
        role,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast.success("User created", { description: res.message });
      form.reset();
      setPassword("");
      onCreated();
    });
  }

  return (
    <Card className="p-6">
      <h2 className="flex items-center gap-2 font-bold">
        <UserPlus className="h-4 w-4 text-brand-600" /> Create a new user
      </h2>
      <p className="mt-1 text-sm text-slate-500">
        They can sign in straight away at <span className="font-medium">/admin</span> with this email and password.
      </p>
      <form onSubmit={submit} className="mt-5 grid gap-4 md:grid-cols-2">
        <Field label="Full name" htmlFor="new-name">
          <Input id="new-name" name="full_name" required maxLength={120} autoComplete="off" />
        </Field>
        <Field label="Email" htmlFor="new-email">
          <Input id="new-email" name="email" type="email" required autoComplete="off" />
        </Field>
        <Field label="Password" htmlFor="new-password" hint="At least 8 characters with a letter and a number. Share it with them securely.">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                id="new-password"
                type={showPassword ? "text" : "password"}
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:text-slate-700"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setPassword(generatePassword());
                setShowPassword(true);
              }}
              title="Generate a strong password"
            >
              <Wand2 className="h-4 w-4" /> Generate
            </Button>
          </div>
        </Field>
        <div>
          <p className="mb-1.5 text-sm font-medium text-slate-700">Access</p>
          <div className="grid grid-cols-3 gap-2">
            {ROLES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRole(r)}
                aria-pressed={role === r}
                className={cn(
                  "rounded-xl border px-3 py-2.5 text-sm font-semibold transition",
                  role === r ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 hover:border-slate-400",
                )}
              >
                {ROLE_META[r].label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-slate-500">{ROLE_META[role].description}</p>
        </div>
        {error && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700 md:col-span-2">{error}</p>}
        <div className="md:col-span-2">
          <Button type="submit" loading={pending}>
            <ShieldCheck className="h-4 w-4" /> Create user
          </Button>
        </div>
      </form>
    </Card>
  );
}

function UserRow({ user, isMe }: { user: ManagedUser; isMe: boolean }) {
  const [pending, startTransition] = useTransition();
  const [resetting, setResetting] = useState(false);
  const [newPassword, setNewPassword] = useState("");

  function changeRole(role: string) {
    if (role === user.role) return;
    startTransition(async () => {
      const res = await updateUser(user.id, { role });
      if (res.ok) toast.success(`${user.email} is now ${role === "customer" ? "without access" : role}`);
      else toast.error(res.error);
    });
  }

  function savePassword() {
    startTransition(async () => {
      const res = await resetUserPassword(user.id, newPassword);
      if (res.ok) {
        toast.success("Password updated", { description: "Share the new password with them securely." });
        setResetting(false);
        setNewPassword("");
      } else toast.error(res.error);
    });
  }

  function remove() {
    if (!confirm(`Delete ${user.email}? They will no longer be able to sign in. This can't be undone.`)) return;
    startTransition(async () => {
      const res = await deleteUser(user.id);
      if (res.ok) toast.success("User deleted");
      else toast.error(res.error);
    });
  }

  const initials = (user.full_name || user.email).split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");

  return (
    <>
      <tr className={cn("transition", pending && "opacity-60")}>
        <td className="px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-fuchsia-500 text-xs font-bold text-white">
              {initials || "?"}
            </span>
            <div className="min-w-0">
              <p className="truncate font-semibold">
                {user.full_name || "—"} {isMe && <span className="ml-1 text-xs font-medium text-brand-600">(you)</span>}
              </p>
              <p className="truncate text-xs text-slate-500">{user.email}</p>
            </div>
          </div>
        </td>
        <td className="px-4 py-3">
          {isMe ? (
            <RoleBadge role={user.role} />
          ) : (
            <Select
              aria-label={`Access for ${user.email}`}
              value={user.role}
              onChange={(e) => changeRole(e.target.value)}
              disabled={pending}
              className="h-9 w-36 text-sm"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_META[r].label}
                </option>
              ))}
              <option value="customer">No access</option>
            </Select>
          )}
        </td>
        <td className="whitespace-nowrap px-4 py-3 text-slate-500">
          {user.last_sign_in_at ? formatDate(user.last_sign_in_at) : "Never"}
        </td>
        <td className="px-4 py-3 text-right">
          <div className="inline-flex gap-1">
            <button
              onClick={() => setResetting((v) => !v)}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              title="Set a new password"
              aria-label={`Set a new password for ${user.email}`}
            >
              <KeyRound className="h-4 w-4" />
            </button>
            {!isMe && (
              <button
                onClick={remove}
                disabled={pending}
                className="rounded-lg p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-600"
                title="Delete user"
                aria-label={`Delete ${user.email}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </td>
      </tr>
      {resetting && (
        <tr className="bg-slate-50/70">
          <td colSpan={4} className="px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">New password for {user.email}:</span>
              <Input
                type="text"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="h-9 w-56"
                autoComplete="new-password"
                aria-label="New password"
              />
              <Button size="sm" variant="outline" type="button" onClick={() => setNewPassword(generatePassword())}>
                <Wand2 className="h-4 w-4" /> Generate
              </Button>
              <Button size="sm" onClick={savePassword} loading={pending} disabled={newPassword.length < 8}>
                Save password
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setResetting(false)}>
                Cancel
              </Button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
