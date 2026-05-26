import type { Metadata } from "next";
import { Orbitron, Sora } from "next/font/google";
import "./globals.css";
import PWARegister from "@/components/PWARegister";
import { ToastProvider } from "@/components/ui/Toast";

const orbitron = Orbitron({
  variable: "--font-orbitron",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
});

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "BuzzNexus | Realtime Cyber Classroom Quiz Battle",
  description: "Realtime classroom quiz battle platform with cinematic animations, Supabase auth, and live student waiting rooms.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${orbitron.variable} ${sora.variable} h-full antialiased dark`}>
      <body className="min-h-full flex flex-col bg-[#050308] text-gray-100 font-sans selection:bg-[#FF4DCA] selection:text-black">
        <PWARegister />
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
