"use client";

import Link from "next/link";
import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button, buttonClasses } from "@/components/ui";

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-rose-50 text-rose-600">
        <AlertTriangle className="h-6 w-6" />
      </span>
      <h1 className="mt-5 text-2xl font-bold">The admin panel hit an error</h1>
      <p className="mt-2 max-w-md text-sm text-slate-500">
        Try again. If it keeps happening, open Vercel → your project → <strong>Logs</strong> and search for the code
        below to see the exact cause.
      </p>
      {error.digest && (
        <code className="mt-4 rounded-lg bg-slate-100 px-3 py-1.5 text-xs text-slate-700">Error code: {error.digest}</code>
      )}
      <div className="mt-8 flex gap-3">
        <Button onClick={reset}>
          <RefreshCw className="h-4 w-4" /> Try again
        </Button>
        <Link href="/admin/login" className={buttonClasses("outline")}>
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
