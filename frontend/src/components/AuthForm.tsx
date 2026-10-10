"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Logo } from "./Header";
import { Button, Field, Notice } from "./ui";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const { user, loading, login, signup } = useAuth();
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isSignup = mode === "signup";

  useEffect(() => { if (!loading && user) router.replace("/dashboard"); }, [loading, user, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      if (isSignup) await signup(name.trim(), email.trim(), password);
      else await login(email.trim(), password);
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-dvh place-items-center px-4 py-12">
      <div className="w-full max-w-sm space-y-8 animate-fade-in">
        <div className="flex flex-col items-center gap-3 text-center">
          <Logo />
          <h1 className="text-xl font-semibold tracking-tight">{isSignup ? "Create your account" : "Welcome back"}</h1>
          <p className="text-sm text-dim">{isSignup ? "Start turning videos into GIFs." : "Sign in to open your library."}</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          {error && <Notice tone="danger">{error}</Notice>}
          {isSignup && <Field label="Name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} autoComplete="name" autoFocus />}
          <Field label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" autoFocus={!isSignup} />
          <Field label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
            minLength={isSignup ? 8 : undefined} autoComplete={isSignup ? "new-password" : "current-password"}
            hint={isSignup ? "At least 8 characters." : undefined} />
          <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy}>{isSignup ? "Create account" : "Sign in"}</Button>
        </form>
        <p className="text-center text-sm text-dim">
          {isSignup ? "Already have an account? " : "New here? "}
          <Link href={isSignup ? "/login" : "/signup"} className="text-fg underline-offset-4 hover:underline">{isSignup ? "Sign in" : "Create an account"}</Link>
        </p>
      </div>
    </div>
  );
}
