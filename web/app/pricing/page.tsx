"use client";

import Link from "next/link";

export default function Pricing() {
  return (
    <div className="min-h-screen bg-[#0f172a] pt-20 pb-20 px-6">
      <div className="max-w-5xl mx-auto text-center mb-14">
        <div className="text-accent tracking-[3px] text-sm mb-2">TRANSPARENT. VALUE-BASED. BUILT TO SCALE.</div>
        <h1 className="text-4xl md:text-6xl font-semibold tracking-tighter">Pricing that grows with your ambition</h1>
        <p className="mt-4 text-xl text-white/70 max-w-md mx-auto">Start free. Prove ROI on day one. Scale to enterprise when you're ready to dominate your category.</p>
      </div>

      <div className="max-w-6xl mx-auto grid md:grid-cols-3 gap-6">
        {/* Free / Open */}
        <div className="glass p-8 rounded-3xl border border-white/10 flex flex-col">
          <div>
            <div className="font-mono text-xs tracking-widest text-white/60">OPEN CORE</div>
            <div className="text-4xl font-semibold mt-1 tracking-tighter">Free</div>
            <div className="text-white/60 mt-1">Forever for individuals &amp; small teams</div>
          </div>
          <ul className="mt-8 space-y-3 text-sm flex-1">
            <li className="flex gap-2"><span className="text-emerald-400">✓</span> Full Smart Optimizer (local)</li>
            <li className="flex gap-2"><span className="text-emerald-400">✓</span> 3D Visualizer &amp; exports</li>
            <li className="flex gap-2"><span className="text-emerald-400">✓</span> GitHub access + community</li>
            <li className="flex gap-2 text-white/50">— Cloud sync &amp; history</li>
            <li className="flex gap-2 text-white/50">— Advanced compliance packs</li>
          </ul>
          <Link href="/demo" className="mt-auto block text-center py-3.5 bg-white/10 hover:bg-white/15 rounded-2xl font-medium">Start with Live Demo</Link>
        </div>

        {/* Pro */}
        <div className="glass p-8 rounded-3xl border-2 border-primary relative flex flex-col">
          <div className="absolute -top-3 right-6 bg-primary text-xs px-4 py-1 rounded font-semibold tracking-wider">MOST POPULAR</div>
          <div>
            <div className="font-mono text-xs tracking-widest text-primary">PRO / TEAM</div>
            <div className="text-5xl font-semibold mt-1 tracking-tighter">$890<span className="text-2xl align-super font-normal text-white/60">/mo</span></div>
            <div className="text-white/60">per site • billed annually</div>
          </div>
          <ul className="mt-8 space-y-3 text-sm flex-1">
            <li className="flex gap-2"><span className="text-emerald-400">✓</span> Everything in Free +</li>
            <li className="flex gap-2"><span className="text-emerald-400">✓</span> Cloud history &amp; team sharing</li>
            <li className="flex gap-2"><span className="text-emerald-400">✓</span> API access + webhooks</li>
            <li className="flex gap-2"><span className="text-emerald-400">✓</span> Priority support + SLA</li>
            <li className="flex gap-2"><span className="text-emerald-400">✓</span> Advanced ROI reporting</li>
          </ul>
          <Link href="/signin" className="mt-auto block text-center py-3.5 bg-primary text-primary-foreground font-semibold rounded-2xl">Start 14-day Pro Trial</Link>
        </div>

        {/* Enterprise */}
        <div className="glass p-8 rounded-3xl border border-white/10 flex flex-col">
          <div>
            <div className="font-mono text-xs tracking-widest text-white/60">ENTERPRISE</div>
            <div className="text-4xl font-semibold mt-1 tracking-tighter">Custom</div>
            <div className="text-white/60 mt-1">For high-volume &amp; regulated operations</div>
          </div>
          <ul className="mt-8 space-y-3 text-sm flex-1">
            <li className="flex gap-2"><span className="text-emerald-400">✓</span> Everything in Pro +</li>
            <li className="flex gap-2"><span className="text-emerald-400">✓</span> On-prem / air-gapped deployment</li>
            <li className="flex gap-2"><span className="text-emerald-400">✓</span> Certified robot connectors (UR, Fanuc, ABB...)</li>
            <li className="flex gap-2"><span className="text-emerald-400">✓</span> Full compliance &amp; audit packs</li>
            <li className="flex gap-2"><span className="text-emerald-400">✓</span> Dedicated success engineer + custom dev</li>
            <li className="flex gap-2"><span className="text-emerald-400">✓</span> Volume-based pricing &amp; white-label</li>
          </ul>
          <Link href="/signin" className="mt-auto block text-center py-3.5 border border-white/30 hover:bg-white/5 rounded-2xl font-medium">Talk to Sales</Link>
        </div>
      </div>

      <p className="text-center text-xs text-white/50 mt-10 max-w-md mx-auto">All plans include the core open-source engine. Enterprise unlocks the full production stack and reference deployment support.</p>
    </div>
  );
}
