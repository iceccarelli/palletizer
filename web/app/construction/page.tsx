"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  optimizeConstructionPallet,
  DEMO_CONSTRUCTION_SKUS,
  type ConstructionPalletPlan,
} from "@/lib/construction-optimizer";

export default function ConstructionPage() {
  const [plan, setPlan] = useState<ConstructionPalletPlan | null>(null);
  const [quantities, setQuantities] = useState([24, 6, 40]); // drywall, lumber, bags
  const [prioritize, setPrioritize] = useState<"stability" | "density">("stability");
  const [isOptimizing, setIsOptimizing] = useState(false);

  const runDemo = () => {
    setIsOptimizing(true);
    setTimeout(() => {
      setPlan(optimizeConstructionPallet(DEMO_CONSTRUCTION_SKUS, quantities, prioritize));
      setIsOptimizing(false);
    }, 300);
  };

  const updateQty = (idx: number, val: number) => {
    const next = [...quantities];
    next[idx] = Math.max(1, Math.min(200, val));
    setQuantities(next);
  };

  return (
    <main className="pt-28 pb-24">
      {/* Hero */}
      <section className="max-w-5xl mx-auto px-6 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 text-[11px] tracking-[2px] mb-6 border border-white/10 text-white/60">
          CONSTRUCTION MATERIALS &amp; SUPPLY CHAIN
        </div>
        <h1 className="text-5xl md:text-6xl font-semibold tracking-tighter leading-[1.05] mb-5">
          Palletizing patterns for
          <br />
          construction materials
        </h1>
        <p className="max-w-2xl mx-auto text-lg text-white/70 mb-4">
          The same open-source palletizing engine, extended with construction-specific SKUs and
          stability heuristics for drywall, lumber, bagged goods and flooring.
        </p>
        <p className="max-w-2xl mx-auto text-sm text-white/45 mb-9">
          This vertical is early-stage. We are looking for a first pilot partner — not claiming
          deployments or savings we haven&apos;t measured yet.
        </p>

        <div className="flex flex-wrap justify-center gap-3 mb-10">
          <button
            onClick={runDemo}
            disabled={isOptimizing}
            className="px-7 py-3.5 bg-primary text-primary-foreground rounded-2xl font-semibold hover:opacity-90 active:scale-[0.985] transition disabled:opacity-70"
          >
            {isOptimizing ? "Planning…" : "Try the interactive planner →"}
          </button>
          <Link
            href="/roi-calculator"
            className="px-7 py-3.5 border border-white/25 rounded-2xl font-medium hover:bg-white/5 transition"
          >
            Model your own ROI
          </Link>
        </div>

        <div className="flex flex-wrap justify-center gap-x-8 gap-y-2 text-sm text-white/55">
          <span>Drywall · lumber · bagged · flooring SKUs</span>
          <span>Interlock-aware stability heuristics</span>
          <span>ROS 2 + LiDAR reference nodes</span>
          <span>Open source · Apache-2.0</span>
        </div>
      </section>

      {/* Interactive planner */}
      <section className="max-w-6xl mx-auto px-6 mt-20">
        <div className="bg-white/[0.03] border border-white/10 rounded-3xl p-6 md:p-10">
          <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
            <div>
              <div className="uppercase tracking-[3px] text-[11px] text-emerald-400 mb-1">
                Interactive — runs in your browser
              </div>
              <h2 className="text-3xl font-semibold tracking-tight">Construction mixed-SKU planner</h2>
            </div>
            <div className="text-right text-xs text-white/45 max-w-xs">
              Simplified TypeScript port of the Python engine. Numbers below are illustrative, not
              validated performance.
            </div>
          </div>

          {/* SKU controls */}
          <div className="grid md:grid-cols-3 gap-5 mb-8">
            {DEMO_CONSTRUCTION_SKUS.map((sku, idx) => (
              <div key={sku.sku_id} className="bg-black/30 border border-white/10 rounded-2xl p-5">
                <div className="font-mono text-[11px] text-white/40 mb-1">{sku.sku_id}</div>
                <div className="font-medium mb-3">{sku.name}</div>
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-white/55">Quantity</span>
                  <input
                    type="number"
                    value={quantities[idx]}
                    onChange={(e) => updateQty(idx, parseInt(e.target.value) || 1)}
                    className="w-20 bg-black/40 border border-white/20 rounded px-3 py-1 text-right font-mono"
                  />
                </div>
                <div className="text-[10px] text-white/45 grid grid-cols-2 gap-x-4">
                  <div>
                    {sku.length_mm}×{sku.width_mm} mm
                  </div>
                  <div>
                    {sku.weight_kg} kg · {sku.material_type}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3 mb-6">
            <span className="text-sm text-white/55">Prioritize:</span>
            <button
              onClick={() => setPrioritize("stability")}
              className={`px-5 py-1.5 rounded-full text-sm border transition ${
                prioritize === "stability"
                  ? "bg-white text-black border-white"
                  : "border-white/20 hover:bg-white/5"
              }`}
            >
              Stability
            </button>
            <button
              onClick={() => setPrioritize("density")}
              className={`px-5 py-1.5 rounded-full text-sm border transition ${
                prioritize === "density"
                  ? "bg-white text-black border-white"
                  : "border-white/20 hover:bg-white/5"
              }`}
            >
              Density
            </button>
            <button
              onClick={runDemo}
              disabled={isOptimizing}
              className="ml-auto px-7 py-2.5 bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 transition text-white font-medium rounded-2xl disabled:opacity-60"
            >
              {isOptimizing ? "Computing…" : "Optimize pallet"}
            </button>
          </div>

          {plan && (
            <div className="mt-4 border-t border-white/10 pt-8">
              <div className="grid md:grid-cols-4 gap-4 mb-8">
                <Metric label="Heuristic stability" value={`${plan.overall_stability}`} sub="Target ≥ 0.93" />
                <Metric label="Total height" value={`${plan.total_height_mm}`} unit="mm" sub="Within 1800 mm envelope" />
                <Metric
                  label="Footprint estimate"
                  value={`${(plan.volume_utilization * 100).toFixed(1)}`}
                  unit="%"
                  sub="Rough, illustrative"
                />
                <Metric label="Est. cycle / pallet" value={`${plan.estimated_cycle_time_s}`} unit="s" sub="~9 s/pick model" />
              </div>

              <div className="mb-6">
                <div className="uppercase text-[11px] tracking-[2px] text-white/45 mb-3">
                  Layer breakdown ({plan.layers.length})
                </div>
                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  {plan.layers.map((layer, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between bg-black/30 border border-white/10 rounded-xl px-5 py-3 text-sm"
                    >
                      <div className="flex items-center gap-4">
                        <span className="font-mono w-9 text-white/40">L{i + 1}</span>
                        <span>
                          {layer.items.length} item{layer.items.length === 1 ? "" : "s"} ·{" "}
                          {layer.items[0]?.sku.name.split(" ")[0]}
                        </span>
                      </div>
                      <div className="flex items-center gap-6 font-mono text-xs text-white/60">
                        <span>stab {layer.stability_score}</span>
                        <span>dens {(layer.density_utilization * 100).toFixed(0)}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-black/30 border border-white/10 rounded-2xl p-6 text-sm">
                <div className="font-medium mb-2 text-emerald-400">Planner notes</div>
                <p className="text-white/75">{plan.construction_notes}</p>
                <div className="mt-4 pt-4 border-t border-white/10 text-xs text-white/45">
                  The plan exports to the same JSON contract the Python core uses, so it can drive a
                  real cell through the ROS 2 reference node. Real-world stability still needs
                  validation on your materials and pallets.
                </div>
              </div>

              <div className="mt-6 flex flex-col sm:flex-row gap-3">
                <Link
                  href="/hardware"
                  className="flex-1 text-center py-3 border border-white/20 rounded-2xl hover:bg-white/5 text-sm font-medium"
                >
                  Hardware &amp; ROS 2 reference →
                </Link>
                <Link
                  href="/contact"
                  className="flex-1 text-center py-3 bg-white text-black rounded-2xl text-sm font-medium"
                >
                  Request a pilot
                </Link>
              </div>
            </div>
          )}

          {!plan && (
            <div className="text-center py-10 text-white/40 text-sm">
              Set quantities and click <span className="font-medium text-white/70">Optimize pallet</span>{" "}
              to generate an illustrative layer plan.
            </div>
          )}
        </div>
      </section>

      {/* Why construction */}
      <section className="max-w-5xl mx-auto px-6 mt-24">
        <div className="grid md:grid-cols-2 gap-x-12 gap-y-10">
          <div>
            <div className="uppercase tracking-[3px] text-[11px] mb-3 text-white/45">Why this vertical</div>
            <h3 className="text-3xl font-semibold tracking-tight leading-tight mb-5">
              Construction materials are heavy, repetitive, and mostly still handled by hand.
            </h3>
            <div className="space-y-4 text-white/70 text-[15px]">
              <p>
                Drywall, lumber and bagged cement drive a large share of manual-handling injuries in
                the trades, and much of the palletizing in supply and prefab yards is still manual.
              </p>
              <p>
                Robotic palletizing of finished construction products is a plausible place for an
                open engine to be useful: the SKUs are large and predictable, and the stability rules
                differ enough from general warehouse palletizing to be worth modeling directly.
              </p>
            </div>
          </div>
          <div className="bg-white/[0.03] border border-white/10 rounded-3xl p-8 text-sm">
            <div className="font-mono text-[11px] text-emerald-400 mb-4">Market context (external estimates)</div>
            <ul className="space-y-3 text-white/75">
              <li className="flex gap-3">
                <span className="text-emerald-400">→</span> Construction-robotics forecasts commonly
                cite double-digit CAGRs through 2030
              </li>
              <li className="flex gap-3">
                <span className="text-emerald-400">→</span> Heavy material handling is a leading
                injury driver in the trades
              </li>
              <li className="flex gap-3">
                <span className="text-emerald-400">→</span> Prefab and modular demand (data centers,
                housing) is growing
              </li>
              <li className="flex gap-3">
                <span className="text-emerald-400">→</span> Labor shortages are pushing adoption of
                automation
              </li>
            </ul>
            <div className="mt-6 pt-6 border-t border-white/10 text-xs text-white/45">
              These are third-party industry estimates, not our own results. We have no deployments
              or payback figures to report yet.
            </div>
          </div>
        </div>
      </section>

      {/* Honest CTA */}
      <section className="max-w-3xl mx-auto px-6 mt-24 text-center">
        <h3 className="text-2xl font-semibold tracking-tight mb-4">Want to try this on a real line?</h3>
        <p className="text-white/70 mb-8">
          The engine, the browser demo and the ROS 2 reference code are all open. If you run a
          construction-products line or prefab yard and want to pilot, we&apos;d like to talk — this is
          pre-revenue and we&apos;re looking for a first partner.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link href="/contact" className="px-7 py-3.5 bg-white text-black rounded-2xl font-medium">
            Request a pilot
          </Link>
          <Link
            href="https://github.com/iceccarelli/palletizer"
            target="_blank"
            className="px-7 py-3.5 border border-white/25 rounded-2xl font-medium hover:bg-white/5"
          >
            Read the source
          </Link>
        </div>
      </section>
    </main>
  );
}

function Metric({
  label,
  value,
  unit,
  sub,
}: {
  label: string;
  value: string;
  unit?: string;
  sub: string;
}) {
  return (
    <div className="bg-black/30 rounded-2xl p-5 border border-white/10">
      <div className="text-emerald-400 text-[11px] tracking-widest uppercase">{label}</div>
      <div className="text-4xl font-mono font-semibold mt-2 tracking-tighter">
        {value}
        {unit && <span className="text-2xl">{unit}</span>}
      </div>
      <div className="text-xs text-white/45 mt-1">{sub}</div>
    </div>
  );
}
