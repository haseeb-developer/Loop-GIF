import { Skeleton } from "@/components/ui";

export default function Loading() {
  return <div className="space-y-6"><Skeleton className="h-8 w-48" /><Skeleton className="h-64" /></div>;
}
