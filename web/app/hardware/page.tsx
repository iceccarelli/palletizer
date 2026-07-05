"use client";

import React from "react";
import Link from "next/link";

const CELLS = [
  {
    brand: "KUKA",
    model: "KR FORTEC / TITAN class",
    payload: "120–210 kg+",
    use: "Heavy lumber bundles, bagged goods, stone, large drywall stacks",
    why: "High-payload, high-stiffness arms with mature ROS 2 support via kuka drivers.",
    ros: "ROS 2 + MoveIt",
  },
  {
    brand: "FANUC",
    model: "M-410iC / M-710iC class",
    payload: "50–450 kg",
    use: "Drywall & flooring lines, case/tote palletizing",
    why: "Common in building-product plants; ROS-Industrial support is well established.",
    ros: "ROS-Industrial + TP export",
  },
  {
    brand: "Mobile hybrid",
    model: "AMR + arm (e.g. MiR/OTTO + arm)",
    payload: "Varies by base + arm",
    use: "Near-site palletizing, yard-to-staging material flow",
    why: "nav2 for the base plus Palletizer planning for the arm — an area we think is promising, not something we've deployed.",
    ros: "nav2 + ros2_control + reference node",
  },
];

export default function HardwarePage() {
  return (
    <main className="pt-28 pb-24">
      {/* Hero */}
      <section className="max-w-5xl mx-auto px-6">
        <div className="max-w-3xl">
          <div className="uppercase tracking-[4px] text-[11px] text-white/45 mb-2">
            Hardware &amp; integration
          </div>
          <h1 className="text-5xl md:text-6xl font-semibold tracking-tighter leading-[1.05]">
            Vendor-neutral hardware
            <br />
            reference architectures
          </h1>
          <p className="mt-6 text-lg text-white/70">
            Palletizer is software: an open engine plus a ROS 2 bridge pattern. This page is our
            recommendation of arms, sensors and tooling that fit construction materials, along with
            open bridge examples. These are reference designs — not certified products, and not yet
            proven on a production line.
          </p>
        </div>
      </section>

      {/* Recommended cells */}
      <section className="max-w-6xl mx-auto px-6 mt-16">
        <div className="uppercase text-[11px] tracking-widest text-white/45 mb-4">
          Arms that suit construction materials
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {CELLS.map((cell) => (
            <div
              key={cell.model}
              className="border border-white/10 rounded-3xl p-7 bg-white/[0.03] flex flex-col"
            >
              <div className="font-mono text-[11px] text-emerald-400 mb-1">
                {cell.brand.toUpperCase()}
              </div>
              <div className="text-xl font-semibold tracking-tight mb-1">{cell.model}</div>
              <div className="text-sm text-white/55 mb-4">{cell.payload} payload class</div>
              <div className="text-sm mb-4 flex-1 text-white/80">{cell.use}</div>
              <div className="pt-4 border-t border-white/10 text-xs space-y-1 text-white/60">
                <div>
                  <span className="text-white/40">Why: </span>
                  {cell.why}
                </div>
                <div>
                  <span className="text-white/40">ROS 2: </span>
                  {cell.ros}
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 text-xs text-white/40">
          Robot models and payload classes above are the manufacturers&apos; public specifications.
          Suitability for your materials still needs to be validated case by case.
        </div>
      </section>

      {/* ROS2 + LiDAR */}
      <section className="mt-20 border-y border-white/10 bg-white/[0.02] py-16">
        <div className="max-w-5xl mx-auto px-6 grid md:grid-cols-5 gap-x-12">
          <div className="md:col-span-2 mb-8 md:mb-0">
            <div className="uppercase tracking-[3px] text-[11px] text-emerald-400 mb-2">
              Software ↔ hardware
            </div>
            <h2 className="text-3xl font-semibold tracking-tighter leading-tight">
              The same engine, from browser to robot cell
            </h2>
            <p className="mt-5 text-white/70 text-sm">
              The goal is one codebase: the optimizer that runs the website demos also drives the
              ROS 2 reference node. LiDAR perception is designed to feed real-world state back into
              the planner.
            </p>
            <Link href="/integrations" className="inline-block mt-5 text-sm underline">
              Technical integration docs →
            </Link>
          </div>
          <div className="md:col-span-3 space-y-7 text-sm">
            <div>
              <div className="font-medium mb-2">Dust-tolerant perception (designed for)</div>
              <p className="text-white/70">
                LiDAR point clouds handle airborne dust better than vision. The reference perception
                node is intended to provide pallet pose, load-shift detection and floor-flatness
                estimates. It is reference code, not a validated safety system.
              </p>
            </div>
            <div>
              <div className="font-medium mb-2">ROS 2 reference node</div>
              <p className="text-white/70">
                A node wraps the same <code>ConstructionPalletOptimizer</code> and orchestrator used
                in the demos, so a plan generated in the browser can be executed on a cell.
              </p>
            </div>
            <div>
              <div className="font-medium mb-2">Bridge examples (open, vendor-neutral)</div>
              <p className="text-white/70">
                Bridge stubs follow the same abstraction as the core robot interface. Bring your own
                integrator — the examples are open and not tied to any single vendor.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* End effectors */}
      <section className="max-w-5xl mx-auto px-6 py-16">
        <h3 className="text-2xl font-semibold tracking-tight mb-8">
          End-of-arm tooling that fits these materials
        </h3>
        <div className="grid md:grid-cols-2 gap-6 text-sm">
          <div className="border border-white/10 rounded-3xl p-7 bg-white/[0.03]">
            <div className="font-medium mb-3">Large-area vacuum (drywall &amp; sheet goods)</div>
            <p className="text-white/70">
              Multi-zone vacuum with per-cup control and pressure feedback suits 4×8 sheets. This is
              a tooling recommendation to integrate with the gripper abstraction — we don&apos;t
              manufacture it.
            </p>
          </div>
          <div className="border border-white/10 rounded-3xl p-7 bg-white/[0.03]">
            <div className="font-medium mb-3">Bundle &amp; bag clamps (lumber &amp; bagged)</div>
            <p className="text-white/70">
              Mechanical or pneumatic clamps for 2×4/2×6 bundles and cement bags, with
              interlock-aware placement to reduce shifting in transit.
            </p>
          </div>
        </div>
        <div className="mt-6 text-xs text-white/45">
          Tooling integrates with the existing force/pressure feedback interfaces in the core.
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-white/10 py-14">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <p className="text-white/70 mb-6">
            Interested in trying a construction cell with ROS 2 + LiDAR? We&apos;re looking for a first
            pilot to validate this end to end.
          </p>
          <Link
            href="/contact"
            className="inline-block px-9 py-3.5 bg-white text-black rounded-2xl font-medium"
          >
            Request a pilot
          </Link>
        </div>
      </section>
    </main>
  );
}
