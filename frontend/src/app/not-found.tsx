import Link from "next/link";
import { Logo } from "@/components/Header";
import { buttonClass } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center px-4">
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <Logo />
        <h1 className="text-xl font-semibold">Nothing here</h1>
        <p className="text-sm text-dim">This page doesn&apos;t exist, or the GIF was deleted. Deleted GIFs stop working immediately.</p>
        <Link href="/" className={buttonClass("secondary")}>Go home</Link>
      </div>
    </div>
  );
}
