import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "sonner";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "Palletizer | The Intelligent OS for End-of-Line Palletizing",
  description: "One codebase. Any robot. Any factory. Live mixed-SKU optimization with physics-validated stability, instant ROI quantification, and full audit compliance. The defacto software foundation trusted by leading manufacturers.",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#0f172a] text-white antialiased">
        <Navbar />
        {children}
        <Footer />
        <Toaster position="top-center" richColors closeButton />
      </body>
    </html>
  );
}
