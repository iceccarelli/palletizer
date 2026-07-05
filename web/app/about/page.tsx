"use client";

import React from "react";
import Link from "next/link";

export default function AboutPage() {
  return (
    <main className="pt-28 pb-24">
      {/* Hero */}
      <section className="max-w-4xl mx-auto px-6">
        <div className="max-w-2xl">
          <div className="uppercase tracking-[4px] text-[11px] text-emerald-400 mb-3">About</div>
          <h1 className="text-5xl md:text-6xl font-semibold tracking-tighter leading-[1.05]">
            An open engine for palletizing, aimed at construction materials.
          </h1>
          <p className="mt-6 text-lg text-white/70">
            Palletizer is an open-source palletizing engine. This is an early effort to extend it
            into construction materials — drywall, lumber, bagged goods, flooring. It is
            pre-revenue, has no deployments yet, and is looking for a first pilot partner.
          </p>
        </div>
      </section>

      {/* Mission / why */}
      <section className="max-w-5xl mx-auto px-6 mt-16 grid md:grid-cols-2 gap-x-16 gap-y-12 text-[15px]">
        <div>
          <h3 className="font-semibold tracking-tight text-xl mb-4">What we&apos;re trying to do</h3>
          <p className="text-white/80">
            Reduce the dangerous, repetitive manual handling of construction materials with
            software-defined, hardware-agnostic palletizing that runs on standard industrial arms.
          </p>
          <p className="mt-4 text-white/80">
            We think the near-term future is hybrid, not fully robotic: robots take the heavy,
            repetitive work; people handle craftsmanship, oversight and the messy edge cases.
          </p>
        </div>
        <div>
          <h3 className="font-semibold tracking-tight text-xl mb-4">Why construction first?</h3>
          <p className="text-white/80">
            General warehouse palletizing is mature, but construction supply and prefab are less
            served. The materials are large and predictable and the stability rules differ enough to
            be worth modeling directly.
          </p>
          <p className="mt-4 text-white/80">
            Going deep on one vertical — construction SKUs, stability heuristics, and ROS 2 + LiDAR
            reference code — is a more honest place to start than claiming to solve every industry at
            once.
          </p>
        </div>
      </section>

      {/* Vision — clearly labeled as aspiration */}
      <section className="mt-20 border-y border-white/10 bg-white/[0.02] py-16">
        <div className="max-w-4xl mx-auto px-6">
          <div className="uppercase tracking-widest text-[11px] text-emerald-400 mb-3">
            Where this could go (a view, not a promise)
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold tracking-tighter leading-tight">
            Coordinated fixed and mobile palletizing cells as part of construction material flow.
          </h2>
          <div className="mt-8 grid md:grid-cols-3 gap-8 text-sm text-white/70">
            <div>Fixed and mobile (ROS 2 nav2) cells coordinated by site software.</div>
            <div>BIM / digital-twin links so pallets are built and delivered where a trade needs them.</div>
            <div>Labor shifting from heavy lifting toward oversight, programming and craft.</div>
          </div>
          <p className="mt-8 text-xs text-white/40">
            This is a ten-year view of the space, not a description of what exists today.
          </p>
        </div>
      </section>

      {/* Honest close */}
      <section className="max-w-3xl mx-auto px-6 py-16 text-center">
        <p className="text-white/70 max-w-lg mx-auto">
          If you run a construction-products line or prefab yard and want to pilot this — or you just
          want to poke at the code — get in touch or open the repo.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link
            href="/contact"
            className="px-7 py-3 bg-white text-black rounded-2xl text-sm font-medium"
          >
            Get in touch
          </Link>
          <Link
            href="https://github.com/iceccarelli/palletizer"
            target="_blank"
            className="px-7 py-3 border border-white/25 rounded-2xl text-sm font-medium hover:bg-white/5"
          >
            GitHub repository
          </Link>
        </div>
      </section>
    </main>
  );
}
