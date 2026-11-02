import Link from "next/link";
import { buttonClasses } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
      <p className="text-gradient text-7xl font-black">404</p>
      <h1 className="mt-4 text-2xl font-bold">Page not found</h1>
      <p className="mt-2 text-slate-500">The page you&apos;re looking for doesn&apos;t exist or has moved.</p>
      <Link href="/" className={buttonClasses("primary", "md", "mt-8")}>
        Back to home
      </Link>
    </div>
  );
}
