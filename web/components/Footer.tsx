"use client";

// AWS-pattern sitemap footer: link columns, back-to-top, legal row.
// Only links that resolve to something real.

import Link from "next/link";
import { ArrowUp, Github } from "lucide-react";

const GH = "https://github.com/iceccarelli/palletizer";

const COLUMNS: Array<{ title: string; links: Array<{ href: string; label: string; external?: boolean }> }> = [
  {
    title: "Product",
    links: [
      { href: "/demos?tab=main", label: "Production Interactive" },
      { href: "/demos?tab=ecomm", label: "High-Mix E-comm" },
      { href: "/demos?tab=stress", label: "Stress Test & Recovery" },
      { href: "/demos?tab=multi", label: "Multi-Pallet What-If" },
      { href: "/demos?tab=robot", label: "Robot Execution" },
      { href: "/demos?tab=twin", label: "Digital Twin + Co-Pilot" },
      { href: "/demo", label: "Live Optimizer" },
    ],
  },
  {
    title: "Developers",
    links: [
      { href: GH, label: "GitHub Repository", external: true },
      { href: `${GH}/blob/main/palletizer_full/optimizer.py`, label: "Optimizer Source (Python)", external: true },
      { href: `${GH}/blob/main/DEMO_REBUILD.md`, label: "API Contract & Docs", external: true },
      { href: `${GH}/blob/main/scripts/verify_engine_parity.py`, label: "Engine Parity Proof", external: true },
      { href: `${GH}/blob/main/gateway/demo_api.py`, label: "FastAPI Bridge", external: true },
      { href: `${GH}/releases`, label: "Releases", external: true },
    ],
  },
  {
    title: "Evaluate",
    links: [
      { href: "/roi-calculator", label: "ROI Calculator" },
      { href: "/pricing", label: "Pricing" },
      { href: "/demos", label: "The Six Missions" },
      { href: "/contact", label: "Request a Pilot" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/contact", label: "Contact Us" },
      { href: "/signin", label: "Sign In" },
      { href: "/terms", label: "Terms of Service" },
      { href: "/privacy", label: "Privacy Policy" },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="border-t border-white/10 bg-[#0b1222]">
      {/* Back to top — AWS signature */}
      <button
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        className="w-full py-3 text-xs tracking-[2px] text-white/50 hover:text-white hover:bg-white/5 transition flex items-center justify-center gap-2 border-b border-white/5"
      >
        <ArrowUp className="w-3.5 h-3.5" /> BACK TO TOP
      </button>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <div className="text-sm font-semibold mb-4">{col.title}</div>
              <ul className="space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <Link
                      href={l.href}
                      target={l.external ? "_blank" : undefined}
                      className="text-sm text-white/55 hover:text-white hover:underline underline-offset-4 transition"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Trust line — ours, not AWS's */}
        <div className="mt-12 pt-8 border-t border-white/10 text-center">
          <p className="text-sm text-white/45 max-w-2xl mx-auto">
            Every metric on this site is derived from geometry by the open-source engine — the same algorithm in your
            browser and in the robot cell. No canned animations, no invented numbers.
          </p>
        </div>

        {/* Social + legal row */}
        <div className="mt-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link href={GH} target="_blank" aria-label="GitHub" className="text-white/50 hover:text-white transition">
              <Github className="w-5 h-5" />
            </Link>
          </div>
          <div className="flex items-center gap-5 text-xs text-white/45">
            <Link href="/privacy" className="hover:text-white transition">Privacy</Link>
            <Link href="/terms" className="hover:text-white transition">Site terms</Link>
            <span>© 2026 Palletizer. All rights reserved.</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
