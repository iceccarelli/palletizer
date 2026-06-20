"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, X, Play, Zap } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);

  const navLinks = [
    { href: "/#product", label: "Product" },
    { href: "/demo", label: "Live Optimizer" },
    { href: "/#solutions", label: "Solutions" },
    { href: "/roi-calculator", label: "ROI Calculator" },
    { href: "/pricing", label: "Pricing" },
    { href: "https://github.com/iceccarelli/palletizer", label: "GitHub", external: true },
  ];

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 glass border-b border-white/10">
      <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center">
            <span className="font-mono text-xl font-bold tracking-tighter">P</span>
          </div>
          <div>
            <div className="font-semibold text-2xl tracking-tighter">Palletizer</div>
            <div className="text-[10px] text-muted-foreground -mt-1.5">INTELLIGENT OS</div>
          </div>
        </div>

        {/* Desktop Navigation */}
        <div className="hidden md:flex items-center gap-10 text-sm font-medium">
          {navLinks.map((link) => (
            link.external ? (
              <a key={link.href} href={link.href} target="_blank" rel="noopener noreferrer" 
                 className="hover:text-primary transition-colors flex items-center gap-1">
                {link.label}
              </a>
            ) : (
              <Link key={link.href} href={link.href} className="hover:text-primary transition-colors">
                {link.label}
              </Link>
            )
          ))}
        </div>

        <div className="hidden md:flex items-center gap-4">
          <Link 
            href="/signin" 
            className="px-5 py-2 text-sm font-medium hover:bg-white/5 rounded-xl transition-colors"
          >
            Sign in
          </Link>
          <Link 
            href="/demo" 
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-2xl text-sm font-semibold transition-all active:scale-[0.985]"
          >
            <Play className="w-4 h-4" /> Try Live Demo
          </Link>
          <Link 
            href="/pricing" 
            className="inline-flex items-center gap-2 px-5 py-2.5 border border-white/20 hover:bg-white/5 rounded-2xl text-sm font-semibold transition-all"
          >
            Get Quote
          </Link>
        </div>

        {/* Mobile Menu Button */}
        <button 
          onClick={() => setIsOpen(!isOpen)} 
          className="md:hidden p-2"
          aria-label="Toggle menu"
        >
          {isOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden border-t border-white/10 bg-[#0f172a]/95 backdrop-blur-xl"
          >
            <div className="px-6 py-8 flex flex-col gap-6 text-lg">
              {navLinks.map((link) => (
                link.external ? (
                  <a key={link.href} href={link.href} target="_blank" className="hover:text-primary">{link.label}</a>
                ) : (
                  <Link key={link.href} href={link.href} onClick={() => setIsOpen(false)} className="hover:text-primary">{link.label}</Link>
                )
              ))}
              <div className="pt-4 border-t border-white/10 flex flex-col gap-3">
                <Link href="/signin" className="py-3 text-center border border-white/20 rounded-2xl">Sign in</Link>
                <Link href="/demo" className="py-3 text-center bg-primary text-primary-foreground rounded-2xl font-semibold flex items-center justify-center gap-2">
                  <Play className="w-4 h-4" /> Try Live Optimizer
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
