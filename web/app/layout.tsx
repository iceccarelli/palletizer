import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });
import { Toaster } from "sonner";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import AssistantWidget from "@/components/AssistantWidget";

export const metadata: Metadata = {
  title: "Palletizer | The Intelligent OS for End-of-Line Palletizing",
  description:
    "One codebase. Any robot. Any factory. Live mixed-SKU optimization with physics-validated stability, instant ROI quantification, and full audit compliance.",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f172a",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`dark scroll-smooth scroll-pt-24 ${sans.variable} ${mono.variable}`}>
      <body className="bg-[#0f172a] text-white antialiased overflow-x-hidden font-sans">
        <Navbar />
        {children}
        <Footer />
        <AssistantWidget />
        <Toaster position="top-center" richColors closeButton />
      </body>
    </html>
  );
}
