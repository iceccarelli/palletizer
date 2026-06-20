import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "sonner";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

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
    <html lang="en" className="dark scroll-smooth scroll-pt-24">
      <body className="bg-[#0f172a] text-white antialiased overflow-x-hidden">
        <Navbar />
        {children}
        <Footer />
        <Toaster position="top-center" richColors closeButton />
      </body>
    </html>
  );
}
