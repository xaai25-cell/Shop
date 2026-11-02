"use client";

import Link from "next/link";
import { useTransition } from "react";
import { Eye, EyeOff, ExternalLink, Pencil } from "lucide-react";
import { toast } from "sonner";
import { setProductActive } from "@/app/admin/actions";

export function ProductRowActions({ id, slug, isActive }: { id: string; slug: string; isActive: boolean }) {
  const [pending, startTransition] = useTransition();
  const btn = "rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40";
  return (
    <div className="inline-flex items-center gap-1">
      <button
        className={btn}
        disabled={pending}
        title={isActive ? "Hide from store" : "Show in store"}
        aria-label={isActive ? "Hide from store" : "Show in store"}
        onClick={() =>
          startTransition(async () => {
            const res = await setProductActive(id, !isActive);
            if (!res.ok) toast.error(res.error);
          })
        }
      >
        {isActive ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
      <Link href={`/admin/products/${id}`} className={btn} aria-label="Edit">
        <Pencil className="h-4 w-4" />
      </Link>
      <Link href={`/products/${slug}`} target="_blank" className={btn} aria-label="View in store">
        <ExternalLink className="h-4 w-4" />
      </Link>
    </div>
  );
}
