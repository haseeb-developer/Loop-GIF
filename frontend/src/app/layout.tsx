import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ToastProvider } from "@/components/Toast";
import { AuthProvider } from "@/lib/auth";
import "./globals.css";

const sans = Geist({ subsets: ["latin"], variable: "--font-geist-sans", display: "swap" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Loop · Video to GIF", template: "%s · Loop" },
  description: "Turn any video into a GIF with an exact range, a name you choose and a link that works everywhere.",
};
export const viewport: Viewport = { themeColor: "#0e0f12", colorScheme: "dark" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>
        <AuthProvider>
          <ToastProvider>{children}</ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
