"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Header } from "@/components/Header";
import { Spinner } from "@/components/ui";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  useEffect(() => { if (!loading && !user) router.replace("/login"); }, [loading, user, router]);
  if (!user) return <div className="grid min-h-dvh place-items-center text-dim"><Spinner className="h-5 w-5" /></div>;
  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-page px-4 py-8 sm:px-6 lg:px-10">{children}</main>
    </>
  );
}
