"use client";
import { Button } from "@/components/ui";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="grid min-h-dvh place-items-center px-4">
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="text-sm text-dim">We couldn&apos;t load this page. Try again in a moment.</p>
        <Button onClick={reset}>Try again</Button>
      </div>
    </div>
  );
}
