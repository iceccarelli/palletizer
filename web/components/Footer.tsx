import Link from "next/link";
import { 
  Linkedin, Twitter, Youtube, Github, MessageCircle, 
  Instagram, Facebook, Play, Users 
} from "lucide-react";

const socials = [
  { icon: Linkedin, label: "LinkedIn", href: "#" },
  { icon: Twitter, label: "X / Twitter", href: "#" },
  { icon: Youtube, label: "YouTube", href: "#" },
  { icon: Github, label: "GitHub", href: "https://github.com/iceccarelli/palletizer" },
  { icon: MessageCircle, label: "Discord", href: "#" },
  { icon: Instagram, label: "Instagram", href: "#" },
  { icon: Facebook, label: "Facebook", href: "#" },
  { icon: Play, label: "TikTok", href: "#" },
  { icon: Users, label: "Reddit", href: "#" },
];

export default function Footer() {
  return (
    <footer className="bg-[#020617] border-t border-white/10 pt-16 pb-12">
      <div className="max-w-7xl mx-auto px-6 grid grid-cols-2 md:grid-cols-5 gap-y-12">
        {/* Brand & Mission */}
        <div className="col-span-2 md:col-span-1">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center">
              <span className="font-mono text-lg font-bold tracking-tighter">P</span>
            </div>
            <span className="font-semibold text-2xl tracking-tighter">Palletizer</span>
          </div>
          <p className="text-sm text-muted-foreground max-w-[220px]">
            The defacto intelligent operating system for high-throughput end-of-line palletizing.
          </p>
          <div className="mt-6 text-xs text-muted-foreground">
            © {new Date().getFullYear()} Palletizer Technologies. All rights reserved.
          </div>
        </div>

        {/* Product */}
        <div>
          <div className="font-semibold mb-4 text-sm tracking-wider uppercase text-muted-foreground">Product</div>
          <div className="space-y-2.5 text-sm">
            <Link href="/demo" className="block hover:text-primary transition-colors">Live Optimizer</Link>
            <Link href="/#product" className="block hover:text-primary transition-colors">Features</Link>
            <Link href="/roi-calculator" className="block hover:text-primary transition-colors">ROI Calculator</Link>
            <Link href="https://github.com/iceccarelli/palletizer/releases/tag/v0.1.0" target="_blank" className="block hover:text-primary transition-colors">Open Source v0.2</Link>
            <Link href="/pricing" className="block hover:text-primary transition-colors">Enterprise</Link>
          </div>
        </div>

        {/* Solutions */}
        <div>
          <div className="font-semibold mb-4 text-sm tracking-wider uppercase text-muted-foreground">Solutions</div>
          <div className="space-y-2.5 text-sm">
            <Link href="/#solutions" className="block hover:text-primary transition-colors">Food & Beverage</Link>
            <Link href="/#solutions" className="block hover:text-primary transition-colors">E-commerce & 3PL</Link>
            <Link href="/#solutions" className="block hover:text-primary transition-colors">Pharma & Regulated</Link>
            <Link href="/#solutions" className="block hover:text-primary transition-colors">Consumer Goods</Link>
            <Link href="/demo" className="block hover:text-primary transition-colors">Mixed-SKU Palletizing</Link>
          </div>
        </div>

        {/* Company & Resources */}
        <div>
          <div className="font-semibold mb-4 text-sm tracking-wider uppercase text-muted-foreground">Company</div>
          <div className="space-y-2.5 text-sm">
            <Link href="#" className="block hover:text-primary transition-colors">About</Link>
            <Link href="#" className="block hover:text-primary transition-colors">Blog & Insights</Link>
            <Link href="#" className="block hover:text-primary transition-colors">Careers</Link>
            <Link href="#" className="block hover:text-primary transition-colors">Contact Sales</Link>
            <Link href="https://github.com/iceccarelli/palletizer" target="_blank" className="block hover:text-primary transition-colors">Open Core on GitHub</Link>
          </div>
        </div>

        {/* Legal & Trust */}
        <div>
          <div className="font-semibold mb-4 text-sm tracking-wider uppercase text-muted-foreground">Trust & Legal</div>
          <div className="space-y-2.5 text-sm">
            <Link href="#" className="block hover:text-primary transition-colors">Security</Link>
            <Link href="#" className="block hover:text-primary transition-colors">Compliance (ISO, FDA ready)</Link>
            <Link href="#" className="block hover:text-primary transition-colors">Privacy</Link>
            <Link href="#" className="block hover:text-primary transition-colors">Terms</Link>
            <Link href="#" className="block hover:text-primary transition-colors">SLA & Support</Link>
          </div>
        </div>
      </div>

      {/* Social + Bottom bar */}
      <div className="max-w-7xl mx-auto px-6 mt-16 pt-8 border-t border-white/10 flex flex-col md:flex-row items-center justify-between gap-6 text-sm">
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-muted-foreground">
          {socials.map((social, index) => {
            const Icon = social.icon;
            return (
              <a 
                key={index} 
                href={social.href} 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 hover:text-primary transition-colors group"
                aria-label={social.label}
              >
                <Icon className="w-4 h-4 group-hover:scale-110 transition-transform" />
                <span className="hidden sm:inline text-xs tracking-wider">{social.label}</span>
              </a>
            );
          })}
        </div>

        <div className="text-xs text-muted-foreground text-center md:text-right">
          Built for the world's most demanding manufacturers.<br className="hidden md:block" /> 
          One hard capability. Real ROI. Reference deployments that close deals.
        </div>
      </div>
    </footer>
  );
}
