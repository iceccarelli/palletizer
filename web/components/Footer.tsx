"use client";

import Link from "next/link";
import { toast } from "sonner";
import {
  Linkedin, Twitter, Youtube, Github, MessageCircle,
  Instagram, Facebook, Play, Users,
} from "lucide-react";

const socials = [
  { Icon: Linkedin, label: "LinkedIn", href: "#", color: "#0A66C2" },
  { Icon: Twitter, label: "X / Twitter", href: "#", color: "#1DA1F2" },
  { Icon: Youtube, label: "YouTube", href: "#", color: "#FF0000" },
  { Icon: Github, label: "GitHub", href: "https://github.com/iceccarelli/palletizer", color: "#333333" },
  { Icon: MessageCircle, label: "Discord", href: "#", color: "#5865F2" },
  { Icon: Instagram, label: "Instagram", href: "#", color: "#E4405F" },
  { Icon: Facebook, label: "Facebook", href: "#", color: "#1877F2" },
  { Icon: Play, label: "TikTok", href: "#", color: "#FE2C55" },
  { Icon: Users, label: "Reddit", href: "#", color: "#FF4500" },
];

function SocialTile({ s }: { s: (typeof socials)[number] }) {
  const tile = (
    <div
      style={{ "--brand": s.color } as React.CSSProperties}
      className="w-11 h-11 rounded-2xl bg-white/[0.06] border border-white/10 flex items-center justify-center transition-all duration-200 group-hover:-translate-y-1 group-hover:bg-[var(--brand)] group-hover:border-transparent group-hover:shadow-lg group-hover:shadow-black/50"
    >
      <s.Icon className="w-5 h-5 text-white/80 group-hover:text-white transition-colors" />
    </div>
  );
  return s.href === "#" ? (
    <button onClick={() => toast(s.label + " profile coming soon")} aria-label={s.label} className="group">
      {tile}
    </button>
  ) : (
    <a href={s.href} target="_blank" rel="noopener noreferrer" aria-label={s.label} className="group">
      {tile}
    </a>
  );
}

const linkCls = "block hover:text-primary transition-colors";

export default function Footer() {
  return (
    <footer className="bg-[#020617] border-t border-white/10 pt-16 pb-12">
      <div className="max-w-7xl mx-auto px-6 grid grid-cols-2 md:grid-cols-5 gap-y-12 gap-x-6">
        <div className="col-span-2 md:col-span-1">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center">
              <span className="font-mono text-lg font-bold tracking-tighter text-primary-foreground">P</span>
            </div>
            <span className="font-semibold text-2xl tracking-tighter">Palletizer</span>
          </div>
          <p className="text-sm text-muted-foreground max-w-[220px]">
            The intelligent operating system for high-throughput end-of-line palletizing.
          </p>
          <div className="mt-6 text-xs text-muted-foreground">
            (c) {new Date().getFullYear()} Palletizer Technologies. All rights reserved.
          </div>
        </div>

        <div>
          <div className="font-semibold mb-4 text-sm tracking-wider uppercase text-muted-foreground">Product</div>
          <div className="space-y-2.5 text-sm">
            <Link href="/demo" className={linkCls}>Live Optimizer</Link>
            <Link href="/#product" className={linkCls}>Features</Link>
            <Link href="/roi-calculator" className={linkCls}>ROI Calculator</Link>
            <Link href="https://github.com/iceccarelli/palletizer/releases" target="_blank" className={linkCls}>Releases</Link>
            <Link href="/pricing" className={linkCls}>Enterprise</Link>
          </div>
        </div>

        <div>
          <div className="font-semibold mb-4 text-sm tracking-wider uppercase text-muted-foreground">Solutions</div>
          <div className="space-y-2.5 text-sm">
            <Link href="/#solutions" className={linkCls}>Food &amp; Beverage</Link>
            <Link href="/#solutions" className={linkCls}>E-commerce &amp; 3PL</Link>
            <Link href="/#solutions" className={linkCls}>Pharma &amp; Regulated</Link>
            <Link href="/#solutions" className={linkCls}>Consumer Goods</Link>
            <Link href="/demo" className={linkCls}>Mixed-SKU Palletizing</Link>
          </div>
        </div>

        <div>
          <div className="font-semibold mb-4 text-sm tracking-wider uppercase text-muted-foreground">Company</div>
          <div className="space-y-2.5 text-sm">
            <Link href="/#product" className={linkCls}>About</Link>
            <Link href="https://github.com/iceccarelli/palletizer" target="_blank" className={linkCls}>Blog &amp; Insights</Link>
            <Link href="/contact" className={linkCls}>Careers</Link>
            <Link href="/contact" className={linkCls}>Contact Sales</Link>
            <Link href="https://github.com/iceccarelli/palletizer" target="_blank" className={linkCls}>Open Core on GitHub</Link>
          </div>
        </div>

        <div>
          <div className="font-semibold mb-4 text-sm tracking-wider uppercase text-muted-foreground">Trust &amp; Legal</div>
          <div className="space-y-2.5 text-sm">
            <Link href="/#product" className={linkCls}>Security</Link>
            <Link href="/#product" className={linkCls}>Compliance</Link>
            <Link href="/privacy" className={linkCls}>Privacy</Link>
            <Link href="/terms" className={linkCls}>Terms</Link>
            <Link href="/contact" className={linkCls}>SLA &amp; Support</Link>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 mt-16 pt-8 border-t border-white/10 flex flex-col md:flex-row items-center justify-between gap-8">
        <div className="flex flex-wrap justify-center gap-3">
          {socials.map((s) => <SocialTile key={s.label} s={s} />)}
        </div>
        <div className="text-xs text-muted-foreground text-center md:text-right max-w-sm">
          Built for the world&apos;s most demanding manufacturers.
          One hard capability. Real ROI. Reference deployments that close deals.
        </div>
      </div>
    </footer>
  );
}
