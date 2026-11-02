"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteProduct } from "@/app/admin/actions";
import { Button } from "@/components/ui";

export function DeleteProductButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      className="text-rose-600 hover:bg-rose-50"
      loading={pending}
      onClick={() => {
        if (!confirm(`Delete "${name}"? This removes its images too. Past orders keep their details.`)) return;
        startTransition(async () => {
          const res = await deleteProduct(id);
          if (!res.ok) return void toast.error(res.error);
          toast.success("Product deleted");
          router.push("/admin/products");
        });
      }}
    >
      <Trash2 className="h-4 w-4" /> Delete
    </Button>
  );
}
