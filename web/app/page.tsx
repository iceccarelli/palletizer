"use client";

import Link from "next/link";
import { SectionHeader, SectionShell, Eyebrow, SectionTitle, Card } from "@/components/Section";
import { motion } from "framer-motion";
import { 
  ArrowRight, Check, Play, Zap, Shield, TrendingUp, 
  Users, Award, Clock 
} from "lucide-react";

export default function PalletizerLanding() {
  return (
    <div className="min-h-screen bg-[#0f172a] text-white overflow-hidden">
      {/* HERO - Ruthless, high-conversion */}
      <section className="hero-bg min-h-[100dvh] flex items-center relative pt-20">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 text-xs tracking-[3px] mb-6 border border-white/20">
            v0.2 ENHANCED • OPEN CORE + ENTERPRISE
          </div>
          
          <h1 className="text-4xl sm:text-5xl md:text-7xl font-semibold tracking-tighter leading-[1.05] sm:leading-[0.92] mb-6">
            The Intelligent OS<br />for End-of-Line Palletizing
          </h1>
          <p className="max-w-2xl mx-auto text-lg sm:text-2xl text-white/80 tracking-tight mb-10">
            One codebase. Any robot. Any factory.<br />
            <span className="text-primary">Live mixed-SKU optimization.</span> Physics-validated stability. Instant ROI proof.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link 
              href="/demo" 
              className="group inline-flex items-center justify-center gap-3 px-10 py-4 bg-primary hover:bg-primary/90 active:bg-primary/80 text-lg font-semibold rounded-3xl transition-all shadow-xl shadow-primary/30"
            >
              Try the Live Optimizer <Play className="w-5 h-5 group-hover:translate-x-0.5 transition" />
            </Link>
            <Link 
              href="/demos?tab=cell" 
              className="inline-flex items-center justify-center gap-3 px-8 py-4 border border-white/30 hover:bg-white/5 text-lg font-semibold rounded-3xl transition-all"
            >
              Sabotage a Live Cell
            </Link>
          </div>

          <div className="mt-12 flex flex-wrap justify-center gap-x-8 gap-y-3 text-sm text-white/60">
            <div className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400" /> 18%+ avg density uplift</div>
            <div className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400" /> 8–18 month payback</div>
            <div className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400" /> Full audit & compliance ready</div>
          </div>
        </div>

        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 text-xs tracking-[4px] text-white/40 flex items-center gap-2">
          SCROLL TO DISCOVER <ArrowRight className="w-3 h-3" />
        </div>
      </section>

      {/* TRUST BAR - Social Proof */}
      <div className="border-b border-white/10 py-5 bg-black/30">
        <div className="max-w-7xl mx-auto px-6 flex flex-wrap items-center justify-center gap-x-12 gap-y-3 text-xs uppercase tracking-[3px] text-white/50">
          <div>LEADING F&B MANUFACTURERS</div>
          <div>MAJOR 3PL & E-COMMERCE</div>
          <div>PHARMA & REGULATED INDUSTRIES</div>
          <div>ROBOT INTEGRATORS WORLDWIDE</div>
        </div>
      </div>

      {/* LIVE CELL OS — play the shipped edge stack */}
      <section className="section-padding border-b border-white/10">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-10 items-center">
            <div>
              <div className="text-xs tracking-[3px] text-primary mb-4">NEW • LIVE CELL OS</div>
              <h2 className="text-3xl md:text-5xl font-semibold tracking-tighter mb-5">
                Try to stop it.<br />We dare you.
              </h2>
              <p className="text-white/70 text-lg leading-relaxed mb-6">
                Cut the cloud link mid-pallet — the cell finishes from local cache. Misfeed a box — motion
                only resumes when a vision frame clears the 0.95 confidence gate. Freeze the heartbeat —
                the watchdog latches FAULT_ESTOP in 2.5 seconds instead of moving blind.
              </p>
              <p className="text-white/50 text-sm leading-relaxed mb-8">
                The state machine, thresholds, and recovery logic you&apos;re fighting are a browser mirror of the
                shipped edge stack (<code className="text-white/70">gateway/edge_orchestrator.py</code>). On hardware
                it speaks OPC UA and streams URScript.
              </p>
              <Link
                href="/demos?tab=cell"
                className="group inline-flex items-center gap-3 px-8 py-4 bg-white text-black text-lg font-semibold rounded-3xl hover:bg-white/90 transition-all"
              >
                Run the shift <ArrowRight className="w-5 h-5 group-hover:translate-x-0.5 transition" />
              </Link>
            </div>
            <div className="glass rounded-3xl border border-white/10 p-6">
              <div className="grid grid-cols-2 gap-3 font-mono text-[11px]">
                {[
                  { s: "IDLE", c: "border-emerald-400/50 text-emerald-300" },
                  { s: "MOVING", c: "border-sky-400/50 text-sky-300" },
                  { s: "EXCEPTION_HANDLING", c: "border-amber-400/50 text-amber-300" },
                  { s: "FAULT_ESTOP", c: "border-red-500/50 text-red-300" },
                ].map((x) => (
                  <div key={x.s} className={`px-3 py-4 rounded-xl border bg-white/[0.02] ${x.c}`}>{x.s}</div>
                ))}
              </div>
              <div className="mt-4 space-y-1.5 font-mono text-[10.5px] text-white/45 leading-relaxed">
                <div><span className="text-sky-300">[12.4s]</span> Cloud link severed — active pallet continues from local pattern cache</div>
                <div><span className="text-amber-400">[15.1s]</span> frame-3: conf 0.9312 ≤ 0.95 — no autonomous write, re-imaging</div>
                <div><span className="text-emerald-400">[15.5s]</span> frame-4: conf 0.9875 &gt; 0.95 — correction dx=-9.93 dy=2.31 mm written, move re-armed</div>
                <div><span className="text-violet-300">[31.0s]</span> Pattern plan_cell_1 complete — 12 placements, pallet #1 out</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* THE PROBLEM (Brutal) */}
      <SectionShell>
        <SectionHeader
          eyebrow={'The hidden cost of "good enough"'}
          title="Manual and basic automation is bleeding your margins."
        />
        
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { icon: Users, title: "Labor & Injury Crisis", desc: "High turnover, repetitive strain injuries, and inconsistent quality. One bad pallet can cost thousands in returns and claims." },
            { icon: TrendingUp, title: "Mixed-SKU Chaos", desc: "Traditional systems choke on variety. Most factories still resort to manual stacking for complex orders — killing throughput." },
            { icon: Shield, title: "No Proof, No Trust", desc: "Black-box patterns. No stability validation. No ROI numbers. Integrators and plant managers are flying blind on every deployment." },
          ].map((item, i) => (
            <Card key={i}>
              <item.icon className="w-9 h-9 mb-6 text-accent" />
              <h3 className="text-2xl font-semibold tracking-tight mb-3">{item.title}</h3>
              <p className="text-white/70 leading-relaxed">{item.desc}</p>
            </Card>
          ))}
        </div>
      </SectionShell>

      {/* THE SOLUTION - Our Hard Defensible Capability */}
      <section id="product" className="section-padding bg-[#020617] border-y border-white/10">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col lg:flex-row gap-12 items-center">
            <div className="flex-1">
              <Eyebrow>The one hard capability</Eyebrow>
              <SectionTitle className="mb-6">
                Live Mixed-SKU<br />Pallet Optimizer
              </SectionTitle>
              <p className="text-xl text-white/80 max-w-lg">
                Upload your real SKU master. Get physics-validated 3D plans in seconds. 
                Stability score. Density uplift. Full audit trail. Export ready for any robot.
              </p>
              
              <div className="mt-8 flex flex-col sm:flex-row gap-4">
                <Link href="/demo" className="inline-flex items-center gap-2 px-8 py-3.5 bg-white text-black font-semibold rounded-2xl hover:bg-white/90 transition">
                  Launch Live Demo <Zap className="w-4 h-4" />
                </Link>
                <Link href="https://github.com/iceccarelli/palletizer" target="_blank" className="inline-flex items-center gap-2 px-6 py-3.5 border border-white/30 rounded-2xl hover:bg-white/5 transition">
                  View Source on GitHub
                </Link>
              </div>
            </div>

            {/* Key Metrics / Proof */}
            <div className="flex-1 grid grid-cols-2 gap-4">
              {[
                { value: "18.7%", label: "Average density uplift vs naive" },
                { value: "1.00", label: "Physics stability score achieved" },
                { value: "< 3s", label: "Time to validated plan" },
                { value: "$187k+", label: "Projected annual savings (reference)" },
              ].map((stat, index) => (
                <Card key={index}>
                  <div className="text-4xl md:text-5xl font-mono font-semibold tracking-tighter text-primary mb-1">{stat.value}</div>
                  <div className="text-sm text-white/70">{stat.label}</div>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* SOLUTIONS / INDUSTRIES with Unsplash style backgrounds */}
      <SectionShell id="solutions">
        <SectionHeader
          eyebrow="Built for the toughest environments"
          title="Solutions that win in every vertical"
        />

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { title: "Food & Beverage", desc: "High-volume, hygiene-critical, mixed cases. Validated patterns + full traceability for audits.", img: "https://images.unsplash.com/photo-1606787366850-de6330128bfc?w=800" },
            { title: "E-commerce & 3PL", desc: "Extreme SKU variety. Peak season ready. Maximize cases per pallet and reduce truck rolls.", img: "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=800" },
            { title: "Pharma & Medical", desc: "Compliance-first. Audit logs, validated stability, CFR-ready exports. Zero risk tolerance.", img: "https://images.unsplash.com/photo-1585435557343-3b092031a831?w=800" },
            { title: "Consumer Packaged Goods", desc: "Multi-SKU lines. Fast changeovers. Consistent high-density pallets that protect brand and margins.", img: "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=800" },
          ].map((sol, i) => (
            <div key={i} className="group relative overflow-hidden rounded-3xl aspect-[16/11] flex flex-col justify-end p-8 border border-white/10">
              <div className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-110" 
                   style={{ backgroundImage: `url(${sol.img})` }} />
              <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/70 to-black/90" />
              <div className="relative z-10">
                <h3 className="text-2xl font-semibold tracking-tight mb-2">{sol.title}</h3>
                <p className="text-white/80 text-sm leading-relaxed">{sol.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </SectionShell>

      {/* FINAL CTA - Ruthless */}
      <section className="section-padding bg-[#020617] border-t border-white/10">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <Eyebrow>Get started</Eyebrow>
          <SectionTitle className="mb-6">Ready to turn palletizing into a profit center?</SectionTitle>
          <p className="text-lg md:text-xl text-white/70 mb-10 max-w-2xl mx-auto">
            Run the live engine on your own SKU data — measured density, stability, and ROI before you ever talk to us.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/demo" className="px-14 py-5 text-xl font-semibold bg-primary hover:bg-primary/90 rounded-3xl transition flex items-center justify-center gap-3">
              Start Free Live Demo <ArrowRight />
            </Link>
            <Link href="/pricing" className="px-10 py-5 text-xl font-semibold border border-white/30 hover:bg-white/5 rounded-3xl transition">
              Talk to Sales
            </Link>
          </div>
          <p className="mt-6 text-xs text-white/50 tracking-widest">NO CREDIT CARD • INSTANT ACCESS TO OPTIMIZER • REFERENCE DEPLOYMENT METRICS INCLUDED</p>
        </div>
      </section>
    </div>
  );
}
