"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CheckCircle2, ImageUp, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { uploadReceipt } from "@/app/actions/orders";
import { compressImage, formatBytes } from "@/lib/compress-image";
import { cn } from "@/lib/utils";
import { Button } from "./ui";

export function ReceiptUploader({
  orderNumber,
  token,
  hasReceipt,
}: {
  orderNumber: string;
  token: string;
  hasReceipt: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  async function choose(f: File | undefined) {
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      toast.error("Please upload an image (screenshot or photo of the slip).");
      return;
    }
    setCompressing(true);
    try {
      const compressed = await compressImage(f, { maxSize: 1400, quality: 0.75 });
      if (compressed.size > 4 * 1024 * 1024) throw new Error("Image is too large even after compression.");
      if (preview) URL.revokeObjectURL(preview);
      setFile(compressed);
      setPreview(URL.createObjectURL(compressed));
      setInfo(`${formatBytes(f.size)} → ${formatBytes(compressed.size)}`);
      setDone(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read image.");
    } finally {
      setCompressing(false);
    }
  }

  function submit() {
    if (!file) return;
    const fd = new FormData();
    fd.set("order_number", orderNumber);
    fd.set("token", token);
    fd.set("receipt", file);
    startTransition(async () => {
      const res = await uploadReceipt(fd);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(res.message ?? "Uploaded");
      setDone(true);
      setFile(null);
      router.refresh();
    });
  }

  return (
    <div className="mt-4">
      {hasReceipt && !file && !done && (
        <p className="mb-3 flex items-center gap-2 rounded-xl bg-sky-50 p-3 text-sm text-sky-700">
          <CheckCircle2 className="h-4 w-4" /> Slip received. You can upload a new one to replace it.
        </p>
      )}
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          choose(e.dataTransfer.files?.[0]);
        }}
        className={cn(
          "relative flex min-h-48 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed p-6 text-center transition",
          dragging ? "border-brand-500 bg-brand-50" : "border-slate-200 hover:border-brand-400 hover:bg-slate-50",
        )}
      >
        <AnimatePresence mode="wait">
          {preview ? (
            <motion.div key="preview" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center">
              {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
              <img src={preview} alt="Payment slip preview" className="max-h-72 rounded-xl shadow" />
              {info && <p className="mt-3 text-xs text-slate-500">Compressed: {info}</p>}
              <p className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-brand-600">
                <RefreshCw className="h-3 w-3" /> Tap to choose a different image
              </p>
            </motion.div>
          ) : (
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center">
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-fuchsia-500 text-white shadow-lg shadow-brand-500/30">
                <ImageUp className="h-6 w-6" />
              </span>
              <p className="mt-4 font-semibold">{compressing ? "Compressing…" : "Tap to upload or drag & drop"}</p>
              <p className="mt-1 text-xs text-slate-500">JPG, PNG or WebP · screenshots welcome</p>
            </motion.div>
          )}
        </AnimatePresence>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          onChange={(e) => {
            choose(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>
      <Button className="mt-4 w-full" size="lg" disabled={!file || compressing} loading={pending} onClick={submit}>
        {done ? "Uploaded ✓" : "Submit payment slip"}
      </Button>
    </div>
  );
}
