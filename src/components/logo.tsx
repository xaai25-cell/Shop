import Image from "next/image";
import { cn } from "@/lib/utils";
import { siteConfig } from "@/lib/config";

/** Brand mark (public/logo.png, 400×320). Height drives the size; width follows the 5:4 ratio. */
export function Logo({ className, priority = false }: { className?: string; priority?: boolean }) {
  return (
    <Image
      src="/logo.png"
      alt={`${siteConfig.name} logo`}
      width={400}
      height={320}
      priority={priority}
      className={cn("h-8 w-auto", className)}
    />
  );
}
