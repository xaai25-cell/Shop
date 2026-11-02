"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveAdminNote } from "@/app/admin/actions";
import { Button, Card, Textarea } from "@/components/ui";

export function AdminNoteForm({ orderId, initial }: { orderId: string; initial: string }) {
  const [note, setNote] = useState(initial);
  const [pending, startTransition] = useTransition();
  return (
    <Card className="p-6">
      <label htmlFor="admin-note" className="font-bold">Internal note</label>
      <p className="text-xs text-slate-500">Only visible to admins.</p>
      <Textarea id="admin-note" className="mt-3" value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
      <Button
        size="sm"
        variant="secondary"
        className="mt-2"
        loading={pending}
        disabled={note === initial}
        onClick={() =>
          startTransition(async () => {
            const res = await saveAdminNote(orderId, note);
            if (res.ok) toast.success(res.message ?? "Saved");
            else toast.error(res.error);
          })
        }
      >
        Save note
      </Button>
    </Card>
  );
}
