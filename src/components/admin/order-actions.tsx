"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, RotateCcw, Truck, XCircle } from "lucide-react";
import { toast } from "sonner";
import { updateOrderStatus } from "@/app/admin/actions";
import { ADMIN_TRANSITIONS, type OrderStatus } from "@/lib/constants";
import { Button, Card, Textarea } from "@/components/ui";

const ACTIONS: Record<OrderStatus, { label: string; variant: "success" | "danger" | "primary" | "outline"; icon: typeof Truck; needsNote?: boolean }> = {
  approved: { label: "Approve payment", variant: "success", icon: CheckCircle2 },
  delivered: { label: "Mark as delivered", variant: "primary", icon: Truck },
  rejected: { label: "Reject order", variant: "danger", icon: XCircle, needsNote: true },
  pending: { label: "Request new slip", variant: "outline", icon: RotateCcw, needsNote: true },
  slip_uploaded: { label: "Slip uploaded", variant: "outline", icon: CheckCircle2 },
};

export function OrderActions({ orderId, status }: { orderId: string; status: OrderStatus }) {
  const [pending, startTransition] = useTransition();
  const [noteFor, setNoteFor] = useState<OrderStatus | null>(null);
  const [note, setNote] = useState("");
  const allowed = ADMIN_TRANSITIONS[status];

  function run(next: OrderStatus, withNote?: string) {
    startTransition(async () => {
      const res = await updateOrderStatus({ order_id: orderId, status: next, note: withNote });
      if (!res.ok) toast.error(res.error);
      else {
        toast.success(res.message ?? "Updated");
        setNoteFor(null);
        setNote("");
      }
    });
  }

  if (allowed.length === 0) {
    return (
      <Card className="p-6 text-sm text-slate-500">
        This order is <strong>{status}</strong> — no further actions.
      </Card>
    );
  }

  return (
    <Card className="space-y-3 p-6">
      <h2 className="font-bold">Actions</h2>
      {allowed.map((next) => {
        const a = ACTIONS[next];
        const Icon = a.icon;
        return (
          <Button
            key={next}
            variant={a.variant}
            className="w-full"
            disabled={pending}
            onClick={() => {
              if (a.needsNote) setNoteFor(next);
              else if (next !== "approved" || confirm("Confirm the payment has been received?")) run(next);
            }}
          >
            <Icon className="h-4 w-4" /> {a.label}
          </Button>
        );
      })}
      {status !== "rejected" && allowed.includes("rejected") && (
        <p className="text-xs text-slate-500">Rejecting an order automatically returns its items to stock.</p>
      )}

      {noteFor && (
        <div className="space-y-2 rounded-xl bg-slate-50 p-3">
          <label htmlFor="status-note" className="text-sm font-medium">
            {noteFor === "rejected" ? "Reason for rejection (shown to customer)" : "What's wrong with the slip? (shown to customer)"}
          </label>
          <Textarea id="status-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} autoFocus />
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setNoteFor(null)}>Cancel</Button>
            <Button
              size="sm"
              variant={noteFor === "rejected" ? "danger" : "primary"}
              loading={pending}
              disabled={!note.trim()}
              onClick={() => run(noteFor, note.trim())}
            >
              Confirm
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
