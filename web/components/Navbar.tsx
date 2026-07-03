"use client";

// AWS-pattern shell: thin utility bar + main nav with descriptive mega menus.
// Every link goes somewhere real — no placeholder destinations.

import Link from "next/link";
import React, { useEffect, useRef, useState } from "react";
import { Menu, X, Play, ChevronDown, Github, ExternalLink } from "lucide-react";
import { motion, AnimatePresence, useScroll, useMotionValueEvent } from "framer-motion";

const GH = "https://github.com/iceccarelli/palletizer";

interface MegaLink {
  href: string;
  label: string;
  desc: string;
  external?: boolean;
}
interface MegaColumn {
  title: string;
  links: MegaLink[];
}
interface MenuDef {
  id: string;
  label: string;
  columns: MegaColumn[];
}

const MENUS: MenuDef[] = [
  {
    id: "product",
    label: "Product",
    columns: [
      {
        title: "Interactive Demos",
        links: [
          { href: "/demos?tab=main", label: "Production Interactive", desc: "Drag boxes, watch live re-validation" },
          { href: "/demos?tab=ecomm", label: "High-Mix E-comm", desc: "36 chaotic SKUs, speed vs density" },
          { href: "/demos?tab=stress", label: "Stress Test & Recovery", desc: "Break a load, rigid-body drop test" },
          { href: "/demos?tab=multi", label: "Multi-Pallet What-If", desc: "Live order splitting across pallets" },
          { href: "/demos?tab=robot", label: "Robot Execution", desc: "Edit mid-run, export remaining picks" },
          { href: "/demos?tab=twin", label: "Digital Twin + Co-Pilot", desc: "Natural language → constraints" },
        ],
      },
      {
        title: "Tools",
        links: [
          { href: "/demo", label: "Live Optimizer", desc: "Upload your SKU CSV, get a validated plan" },
          { href: "/roi-calculator", label: "ROI Calculator", desc: "Your operations numbers, your savings" },
          { href: "/pricing", label: "Pricing", desc: "Open core, paid deployment & support" },
        ],
      },
    ],
  },
  {
    id: "developers",
    label: "Developers",
    columns: [
      {
        title: "Open Source",
        links: [
          { href: GH, label: "GitHub Repository", desc: "Full Python core + this website", external: true },
          { href: `${GH}/blob/main/palletizer_full/optimizer.py`, label: "The Optimizer (Python)", desc: "376 lines, zero magic — read it", external: true },
          { href: `${GH}/blob/main/scripts/verify_engine_parity.py`, label: "Parity Proof", desc: "Browser engine ≡ Python core, verified", external: true },
          { href: `${GH}/releases`, label: "Releases", desc: "Tagged versions & changelogs", external: true },
        ],
      },
      {
        title: "Integrate",
        links: [
          { href: `${GH}/blob/main/DEMO_REBUILD.md`, label: "API Contract", desc: "/api/optimize · /validate-stability · /adapt-plan", external: true },
          { href: `${GH}/blob/main/gateway/demo_api.py`, label: "FastAPI Bridge", desc: "Run the Python core as the source of truth", external: true },
          { href: "/contact", label: "Request a Pilot", desc: "Same engine, your line, our support" },
        ],
      },
    ],
  },
];

const PLAIN_LINKS = [
  { href: "/#solutions", label: "Solutions" },
  { href: "/pricing", label: "Pricing" },
];

function MegaPanel({ menu, onNavigate }: { menu: MenuDef; onNavigate: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.16 }}
      className="absolute left-1/2 -translate-x-1/2 top-full pt-3 w-[640px] max-w-[92vw]"
    >
      <div className="rounded-2xl border border-white/10 bg-[#0b1222]/95 backdrop-blur-xl shadow-2xl shadow-black/50 p-6 grid grid-cols-2 gap-6">
        {menu.columns.map((col) => (
          <div key={col.title}>
            <div className="text-[10px] tracking-[2px] text-white/40 mb-3">{col.title.toUpperCase()}</div>
            <ul className="space-y-1">
              {col.links.map((l) => (
                <li key={l.label}>
                  <Link
                    href={l.href}
                    target={l.external ? "_blank" : undefined}
                    onClick={onNavigate}
                    className="block px-3 py-2 -mx-3 rounded-xl hover:bg-white/5 transition group"
                  >
                    <div className="text-sm font-medium flex items-center gap-1.5">
                      {l.label}
                      {l.external && <ExternalLink className="w-3 h-3 text-white/30 group-hover:text-white/60" />}
                    </div>
                    <div className="text-xs text-white/50">{l.desc}</div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [mobileAccordion, setMobileAccordion] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);
  const { scrollY } = useScroll();
  const navRef = useRef<HTMLElement>(null);

  useMotionValueEvent(scrollY, "change", (latest) => {
    const previous = scrollY.getPrevious() ?? 0;
    if (isOpen || openMenu) setHidden(false);
    else if (latest > previous && latest > 140) setHidden(true);
    else setHidden(false);
  });

  // Close mega menus on outside click / Escape
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setOpenMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenMenu(null);
    };
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const closeAll = () => {
    setOpenMenu(null);
    setIsOpen(false);
  };

  return (
    <motion.nav
      ref={navRef}
      variants={{ visible: { y: 0 }, hidden: { y: "-100%" } }}
      animate={hidden ? "hidden" : "visible"}
      transition={{ duration: 0.35, ease: "easeInOut" }}
      className="fixed top-0 left-0 right-0 z-50"
    >
      {/* Tier 1 — utility bar (AWS pattern) */}
      <div className="hidden md:block bg-[#080d1a] border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 h-8 flex items-center justify-end gap-5 text-[11px] text-white/50">
          <span className="mr-auto text-white/35">Open-source palletizing engine — same math in browser and robot cell</span>
          <Link href={GH} target="_blank" className="hover:text-white/90 transition flex items-center gap-1">
            <Github className="w-3 h-3" /> GitHub
          </Link>
          <Link href={`${GH}/blob/main/DEMO_REBUILD.md`} target="_blank" className="hover:text-white/90 transition">
            Docs
          </Link>
          <Link href="/contact" className="hover:text-white/90 transition">
            Contact us
          </Link>
        </div>
      </div>

      {/* Tier 2 — main nav */}
      <div className="glass border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 shrink-0" onClick={closeAll}>
            <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center">
              <span className="font-mono text-xl font-bold tracking-tighter text-primary-foreground">P</span>
            </div>
            <div className="leading-none">
              <div className="font-semibold tracking-tight text-lg">Palletizer</div>
              <div className="text-[9px] tracking-[2.5px] text-white/40">INTELLIGENT OS</div>
            </div>
          </Link>

          {/* Desktop nav */}
          <div className="hidden lg:flex items-center gap-1 relative">
            {MENUS.map((m) => (
              <div key={m.id} className="relative">
                <button
                  onClick={() => setOpenMenu(openMenu === m.id ? null : m.id)}
                  onMouseEnter={() => setOpenMenu(m.id)}
                  aria-expanded={openMenu === m.id}
                  className={`px-4 py-2 text-sm rounded-full flex items-center gap-1 transition ${
                    openMenu === m.id ? "bg-white/10 text-white" : "text-white/70 hover:text-white"
                  }`}
                >
                  {m.label}
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${openMenu === m.id ? "rotate-180" : ""}`} />
                </button>
                <AnimatePresence>{openMenu === m.id && <MegaPanel menu={m} onNavigate={closeAll} />}</AnimatePresence>
              </div>
            ))}
            {PLAIN_LINKS.map((l) => (
              <Link
                key={l.label}
                href={l.href}
                onClick={closeAll}
                onMouseEnter={() => setOpenMenu(null)}
                className="px-4 py-2 text-sm text-white/70 hover:text-white transition"
              >
                {l.label}
              </Link>
            ))}
          </div>

          <div className="hidden lg:flex items-center gap-3">
            <Link href="/signin" className="text-sm text-white/70 hover:text-white transition">
              Sign in
            </Link>
            <Link
              href="/demos"
              onClick={closeAll}
              className="px-5 py-2.5 bg-primary text-primary-foreground rounded-2xl font-semibold text-sm flex items-center gap-2 hover:opacity-90 transition"
            >
              <Play className="w-4 h-4" /> Try Live Demo
            </Link>
            <Link
              href="/contact"
              className="px-5 py-2.5 border border-emerald-500/50 text-emerald-300 rounded-2xl font-semibold text-sm hover:bg-emerald-500/10 transition"
            >
              Request a pilot
            </Link>
          </div>

          {/* Mobile toggle */}
          <button onClick={() => setIsOpen(!isOpen)} className="lg:hidden p-2" aria-label="Menu">
            {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile drawer with accordions */}
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="lg:hidden overflow-hidden border-t border-white/10 bg-[#0b1222]"
            >
              <div className="px-4 py-4 flex flex-col gap-1 max-h-[75vh] overflow-y-auto">
                {MENUS.map((m) => (
                  <div key={m.id}>
                    <button
                      onClick={() => setMobileAccordion(mobileAccordion === m.id ? null : m.id)}
                      className="w-full py-3 flex items-center justify-between text-left font-medium"
                      aria-expanded={mobileAccordion === m.id}
                    >
                      {m.label}
                      <ChevronDown className={`w-4 h-4 transition-transform ${mobileAccordion === m.id ? "rotate-180" : ""}`} />
                    </button>
                    <AnimatePresence>
                      {mobileAccordion === m.id && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          {m.columns.flatMap((c) => c.links).map((l) => (
                            <Link
                              key={l.label}
                              href={l.href}
                              target={l.external ? "_blank" : undefined}
                              onClick={closeAll}
                              className="block py-2.5 pl-4 border-l border-white/10 ml-1"
                            >
                              <div className="text-sm">{l.label}</div>
                              <div className="text-xs text-white/45">{l.desc}</div>
                            </Link>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))}
                {PLAIN_LINKS.map((l) => (
                  <Link key={l.label} href={l.href} onClick={closeAll} className="py-3 font-medium">
                    {l.label}
                  </Link>
                ))}
                <div className="pt-3 mt-2 border-t border-white/10 grid grid-cols-2 gap-2">
                  <Link
                    href="/demos"
                    onClick={closeAll}
                    className="py-3 text-center bg-primary text-primary-foreground rounded-2xl font-semibold text-sm flex items-center justify-center gap-2"
                  >
                    <Play className="w-4 h-4" /> Live Demo
                  </Link>
                  <Link
                    href="/contact"
                    onClick={closeAll}
                    className="py-3 text-center border border-emerald-500/50 text-emerald-300 rounded-2xl font-semibold text-sm"
                  >
                    Request a pilot
                  </Link>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.nav>
  );
}
