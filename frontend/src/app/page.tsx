"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { Logo } from "@/components/Header";
import { LinkButton } from "@/components/ui";
import { LinkIcon, ScissorsIcon, ShareIcon } from "@/components/icons";

const FEATURES = [
  { icon: <ScissorsIcon />, title: "Exact cuts", text: "Any length of video. Pick the start and end to the millisecond, with a timeline you can zoom." },
  { icon: <LinkIcon />, title: "Names that stick", text: "Choose a link like /g/cat_edit. It plays inline in Discord and forums, and works in an img tag." },
  { icon: <ShareIcon />, title: "Previews everywhere", text: "Share pages carry the metadata WhatsApp, Slack, iMessage and X need for a proper card." },
];

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();
  useEffect(() => { if (!loading && user) router.replace("/dashboard"); }, [loading, user, router]);
  return (
    <div className="mx-auto flex min-h-dvh max-w-page flex-col px-4 sm:px-6 lg:px-10">
      <header className="flex h-14 items-center justify-between">
        <Logo />
        <div className="flex items-center gap-2">
          <Link href="/login" className="rounded-md px-3 py-1.5 text-sm text-dim hover:text-fg">Sign in</Link>
          <LinkButton href="/signup" variant="primary" size="sm">Get started</LinkButton>
        </div>
      </header>
      <main className="flex flex-1 flex-col items-center justify-center gap-14 py-20 text-center">
        <div className="max-w-2xl space-y-6 animate-fade-in">
          <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-6xl">Video to GIF, done properly.</h1>
          <p className="text-balance text-lg text-dim">Upload a video of any length, choose the exact moment, name it, and share a link that just works.</p>
          <div className="flex justify-center gap-3">
            <LinkButton href="/signup" variant="primary" size="lg">Create your first GIF</LinkButton>
            <LinkButton href="/login" size="lg">Sign in</LinkButton>
          </div>
        </div>
        <ul className="grid w-full max-w-5xl gap-4 text-left sm:grid-cols-3">
          {FEATURES.map((f) => (
            <li key={f.title} className="space-y-2 rounded-xl border border-line bg-raised p-5">
              <span className="grid h-9 w-9 place-items-center rounded-lg border border-line-strong text-accent">{f.icon}</span>
              <h2 className="font-medium">{f.title}</h2>
              <p className="text-sm text-dim">{f.text}</p>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
