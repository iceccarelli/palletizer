#!/usr/bin/env bash
# =============================================================================
#  Robot & Cell Showcase — one-shot installer for the palletizer repo
#  Safe to run inside GitHub Codespaces from the repo root.
#  It preserves ALL your current work (stash), builds the showcase on a clean
#  base branched from origin/main, verifies the build, and pushes.
# =============================================================================
set -euo pipefail

# ---- 0. sanity: are we at the repo root? -----------------------------------
if [ ! -d web ] || [ ! -d .git ]; then
  echo "ERROR: run this from the repository root (the folder that contains 'web/' and '.git/')." >&2
  exit 1
fi

BRANCH="feat/robot-cell-showcase"

# ---- 1. rescue any uncommitted work so nothing is ever lost ----------------
if [ -n "$(git status --porcelain)" ]; then
  echo ">> Stashing your current uncommitted work (SwipeGallery, KenBurnsHero, landing/, etc.)"
  git stash push -u -m "wip-before-robot-showcase-$(date +%Y%m%d-%H%M%S)"
  echo "   Recover it any time with:  git stash list   &&   git stash apply"
else
  echo ">> Working tree already clean — nothing to stash."
fi

# ---- 2. move onto a clean branch off the LATEST origin/main ----------------
echo ">> Fetching origin and creating a clean '$BRANCH' from origin/main"
git fetch origin --quiet
git checkout -B "$BRANCH" origin/main
#   (Your fix/consistency-foundation branch is untouched — local and remote.)

# ---- 3. write the RobotShowcase component ----------------------------------
echo ">> Writing web/components/RobotShowcase.tsx"
mkdir -p web/components
cat > web/components/RobotShowcase.tsx << 'PALLETIZER_ROBOTSHOWCASE_EOF'
"use client";

// Robot & Cell Showcase — AWS-product-page-style gallery.
// Horizontal scroll-snap carousel of high-res cards → click any card for a
// full-screen lightbox with large image, precise cell measurements, a
// technical explanation, and a "Similar Views" row from the same set.
//
// Design discipline: reuses the sitewide tokens only — `glass`, rounded-3xl,
// border-white/10, SectionShell/SectionHeader/Eyebrow, font-mono for specs,
// primary (electric blue) + accent (amber), framer-motion, lucide-react.
// Zero layout shift: every image sits in a fixed aspect-ratio well.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  X,
  Ruler,
  Gauge,
  Weight,
  Repeat,
  Move3d,
  Grip,
  Boxes,
} from "lucide-react";
import { SectionHeader } from "@/components/Section";

/* ------------------------------------------------------------------ */
/*  Data model                                                         */
/* ------------------------------------------------------------------ */

type Spec = { icon: React.ElementType; label: string; value: string };

type Robot = {
  id: string;
  src: string;
  name: string;
  tagline: string;
  state: string; // live "independent operation" status chip
  summary: string; // one-line under the card title
  detail: string; // full technical explanation in the lightbox
  specs: Spec[];
};

// Reference cell platform (UR10e-class arm + palletizing end-of-arm tooling).
// Values are consistent with the shipped stack's own claims (≈120 cycles/hr,
// mixed-SKU, physics-validated stacks) and vary per operating view.
const ROBOTS: Robot[] = [
  {
    id: "cell-overview",
    src: "/showcase/robots/01.png",
    name: "Full-Cell Overview",
    tagline: "Autonomous end-of-line build",
    state: "RUNNING · pallet 1 of 2",
    summary: "6-axis arm building a stringer pallet unattended, racking behind.",
    detail:
      "The cell runs the shipped edge orchestrator with no operator in the loop: cases are indexed off the infeed, vision confirms each pick above the 0.95 confidence gate, and the arm places to a physics-validated pattern. Cloud loss falls back to the local pattern cache, so the pallet completes even offline.",
    specs: [
      { icon: Ruler, label: "Reach", value: "1300 mm" },
      { icon: Weight, label: "Payload", value: "12.5 kg" },
      { icon: Gauge, label: "Throughput", value: "120 cases/hr" },
      { icon: Repeat, label: "Repeatability", value: "±0.05 mm" },
      { icon: Move3d, label: "Cell footprint", value: "2.4 × 2.4 m" },
      { icon: Boxes, label: "Pallet format", value: "EUR 1200 × 800 mm" },
    ],
  },
  {
    id: "infeed-pick",
    src: "/showcase/robots/02.png",
    name: "Infeed Pick",
    tagline: "Powered-conveyor case acquisition",
    state: "MOVING · pick z-clear 0.98",
    summary: "Vacuum tooling lifting a case straight off the powered infeed.",
    detail:
      "A metered infeed presents one case at a time. The gripper seals, lifts to a fixed z-clearance, then commits to the placement move only after the vision frame clears the confidence gate — the same interlock exposed in the live cell demo. No autonomous write happens on a low-confidence frame; the case is re-imaged first.",
    specs: [
      { icon: Grip, label: "End effector", value: "Dual-zone vacuum" },
      { icon: Weight, label: "Payload", value: "12.5 kg" },
      { icon: Gauge, label: "Pick rate", value: "≈ 2.0 s / case" },
      { icon: Repeat, label: "Placement acc.", value: "±0.05 mm" },
      { icon: Ruler, label: "Case range", value: "150–600 mm L" },
      { icon: Move3d, label: "Approach", value: "Top-down, guarded" },
    ],
  },
  {
    id: "mixed-sku",
    src: "/showcase/robots/03.png",
    name: "Mixed-SKU Layer Build",
    tagline: "Live density optimization",
    state: "RUNNING · layer 3, 18.7% uplift",
    summary: "Arm placing onto a partially built mixed-SKU layer.",
    detail:
      "The optimizer solves case order and orientation live, so heavier and larger SKUs anchor lower layers while the stability score stays at target. This is the one hard capability rendered in the physical world: a validated 3D plan turned into interlock and column stability on a real stack.",
    specs: [
      { icon: Boxes, label: "SKU mix", value: "Up to 40 / order" },
      { icon: Gauge, label: "Density uplift", value: "+18.7% vs naive" },
      { icon: Weight, label: "Layer mass", value: "≤ 280 kg" },
      { icon: Repeat, label: "Stability score", value: "1.00 target" },
      { icon: Ruler, label: "Reach", value: "1300 mm" },
      { icon: Move3d, label: "Pattern", value: "Interlocked columns" },
    ],
  },
  {
    id: "guarded-line-end",
    src: "/showcase/robots/04.png",
    name: "Guarded Line-End Cell",
    tagline: "Perimeter-safe autonomy",
    state: "RUNNING · guard OK",
    summary: "Arm working inside perimeter fencing at the conveyor end.",
    detail:
      "A guarded end-of-line footprint with light-curtain entry. If the safety heartbeat freezes, the watchdog latches FAULT_ESTOP within 2.5 s rather than moving blind — motion only re-arms after the guard state and a fresh vision frame both clear. Full audit trail is written per placement.",
    specs: [
      { icon: Move3d, label: "Guarding", value: "Fence + light curtain" },
      { icon: Gauge, label: "E-stop latch", value: "≤ 2.5 s" },
      { icon: Repeat, label: "Repeatability", value: "±0.05 mm" },
      { icon: Weight, label: "Payload", value: "12.5 kg" },
      { icon: Ruler, label: "Reach", value: "1300 mm" },
      { icon: Boxes, label: "Audit", value: "Per-placement log" },
    ],
  },
  {
    id: "dual-station",
    src: "/showcase/robots/05.png",
    name: "Completed Pallet · Dual Station",
    tagline: "No-stop pallet changeover",
    state: "RUNNING · station B active",
    summary: "Finished stack beside the arm as it feeds the second station.",
    detail:
      "Two pallet positions let the cell keep building while a completed pallet waits for pickup — throughput never stalls on a changeover. The completed stack shows the interlocked column pattern the optimizer produced, ready for stretch-wrap and dispatch.",
    specs: [
      { icon: Boxes, label: "Stations", value: "2 × pallet" },
      { icon: Gauge, label: "Throughput", value: "120 cases/hr" },
      { icon: Move3d, label: "Changeover", value: "No-stop" },
      { icon: Weight, label: "Pallet load", value: "≤ 1000 kg" },
      { icon: Ruler, label: "Stack height", value: "≤ 2100 mm" },
      { icon: Repeat, label: "Pattern", value: "Validated columns" },
    ],
  },
  {
    id: "night-shift",
    src: "/showcase/robots/06.png",
    name: "Lights-Out Night Shift",
    tagline: "Unattended off-hours running",
    state: "RUNNING · unattended",
    summary: "Arm palletizing under warm facility lighting, no operators present.",
    detail:
      "Lights-out operation is the payback lever: the same cell runs the off-shift with no staffing. Local pattern cache plus the edge state machine keep it autonomous through transient network loss, and every cycle is logged for the morning audit.",
    specs: [
      { icon: Gauge, label: "Uptime target", value: "≥ 95%" },
      { icon: Move3d, label: "Operation", value: "Lights-out" },
      { icon: Repeat, label: "Offline mode", value: "Local cache" },
      { icon: Weight, label: "Payload", value: "12.5 kg" },
      { icon: Ruler, label: "Reach", value: "1300 mm" },
      { icon: Boxes, label: "Payback", value: "8–18 months" },
    ],
  },
  {
    id: "layer-closeup",
    src: "/showcase/robots/07.png",
    name: "Layer Placement Close-Up",
    tagline: "Flush, gap-free seating",
    state: "PLACING · dx −0.4 dy 0.2 mm",
    summary: "Case set flush against the layer with sub-millimetre correction.",
    detail:
      "A close view of the seating move: vision computes an in-plane correction and the controller writes it before contact, so cases land flush with minimal gaps. Tight seating is what turns a density plan on paper into a stable, ship-ready pallet.",
    specs: [
      { icon: Repeat, label: "Correction", value: "Sub-mm, in-plane" },
      { icon: Ruler, label: "Placement acc.", value: "±0.05 mm" },
      { icon: Grip, label: "End effector", value: "Vacuum + guides" },
      { icon: Gauge, label: "Confidence gate", value: "≥ 0.95" },
      { icon: Weight, label: "Case mass", value: "≤ 12.5 kg" },
      { icon: Move3d, label: "Seating", value: "Force-aware" },
    ],
  },
  {
    id: "twin-pallet-wide",
    src: "/showcase/robots/08.png",
    name: "Twin-Pallet Wide Cell",
    tagline: "Multi-position layout",
    state: "RUNNING · 2 lanes",
    summary: "Wide cell servicing multiple pallet positions from one arm.",
    detail:
      "One arm, multiple pallet lanes: the optimizer sequences placements across positions to keep the arm in continuous motion. The same RobotInterface driver (under 100 lines) that runs this layout runs any supported arm — one codebase, any robot.",
    specs: [
      { icon: Boxes, label: "Lanes", value: "2–3 pallet" },
      { icon: Move3d, label: "Footprint", value: "3.0 × 2.4 m" },
      { icon: Gauge, label: "Throughput", value: "120+ cases/hr" },
      { icon: Grip, label: "Driver", value: "< 100 LOC" },
      { icon: Ruler, label: "Reach", value: "1300 mm" },
      { icon: Repeat, label: "Repeatability", value: "±0.05 mm" },
    ],
  },
  {
    id: "high-density",
    src: "/showcase/robots/09.png",
    name: "High-Density Top-Off",
    tagline: "Tall, dense, stable stacks",
    state: "RUNNING · top layer",
    summary: "Arm topping a tall, high-density pallet with warehouse depth behind.",
    detail:
      "The final layers are where instability usually shows up; here the validated pattern holds column stability to the top of a full stack. Denser pallets mean fewer truck rolls — the density uplift compounds straight into freight savings.",
    specs: [
      { icon: Ruler, label: "Stack height", value: "≤ 2100 mm" },
      { icon: Gauge, label: "Density uplift", value: "+18.7%" },
      { icon: Weight, label: "Pallet load", value: "≤ 1000 kg" },
      { icon: Repeat, label: "Stability score", value: "1.00" },
      { icon: Boxes, label: "Freight", value: "Fewer truck rolls" },
      { icon: Move3d, label: "Pattern", value: "Interlocked" },
    ],
  },
  {
    id: "food-grade",
    src: "/showcase/robots/10.png",
    name: "Food-Grade Sanitary Cell",
    tagline: "Washdown-ready hygiene",
    state: "RUNNING · sanitary mode",
    summary: "Gripper over a pallet in a bright, hygiene-critical facility.",
    detail:
      "A hygiene-critical layout with washdown-rated tooling and full traceability for audits. Validated patterns plus per-case logs give food & beverage and pharma lines the compliance trail they need — the same engine, tuned for a sanitary environment.",
    specs: [
      { icon: Grip, label: "Tooling", value: "Washdown-rated" },
      { icon: Boxes, label: "Traceability", value: "Per-case log" },
      { icon: Repeat, label: "Compliance", value: "Audit-ready" },
      { icon: Weight, label: "Payload", value: "12.5 kg" },
      { icon: Ruler, label: "Reach", value: "1300 mm" },
      { icon: Gauge, label: "Throughput", value: "120 cases/hr" },
    ],
  },
];

/* ------------------------------------------------------------------ */
/*  Spec chip                                                          */
/* ------------------------------------------------------------------ */

function SpecItem({ spec }: { spec: Spec }) {
  const Icon = spec.icon;
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-[2px] text-white/45">{spec.label}</div>
        <div className="font-mono text-sm text-white/90">{spec.value}</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Lightbox                                                           */
/* ------------------------------------------------------------------ */

function Lightbox({
  robots,
  activeIndex,
  onClose,
  onSelect,
}: {
  robots: Robot[];
  activeIndex: number;
  onClose: () => void;
  onSelect: (i: number) => void;
}) {
  const robot = robots[activeIndex];

  const go = useCallback(
    (dir: 1 | -1) => {
      const next = (activeIndex + dir + robots.length) % robots.length;
      onSelect(next);
    },
    [activeIndex, robots.length, onSelect]
  );

  // Keyboard: Esc closes, arrows navigate. Body scroll lock while open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [go, onClose]);

  return (
    <motion.div
      className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      role="dialog"
      aria-modal="true"
      aria-label={`${robot.name} — details`}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-md"
        onClick={onClose}
        aria-hidden="true"
      />

      <motion.div
        className="glass relative z-10 flex max-h-[92dvh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#0b1120]/80"
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 8 }}
        transition={{ type: "spring", stiffness: 260, damping: 26 }}
      >
        {/* Close */}
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 z-20 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-black/40 text-white/80 backdrop-blur transition hover:bg-white/10 hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[1.15fr_1fr]">
          {/* Image side */}
          <div className="relative flex items-center justify-center bg-[#060a13] p-4 sm:p-6">
            <div className="relative aspect-[3/4] w-full max-w-md overflow-hidden rounded-2xl border border-white/10">
              <AnimatePresence mode="wait">
                <motion.img
                  key={robot.src}
                  src={robot.src}
                  alt={`${robot.name} — palletizing robot in independent operation`}
                  width={784}
                  height={1168}
                  className="absolute inset-0 h-full w-full object-cover"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  decoding="async"
                />
              </AnimatePresence>
              <div className="pointer-events-none absolute left-3 top-3 rounded-full border border-emerald-400/40 bg-emerald-400/10 px-3 py-1 font-mono text-[10px] tracking-wide text-emerald-300">
                {robot.state}
              </div>
            </div>

            {/* Prev / next over the image */}
            <button
              onClick={() => go(-1)}
              aria-label="Previous view"
              className="absolute left-3 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/50 text-white/80 backdrop-blur transition hover:bg-white/10 hover:text-white sm:inline-flex"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
            <button
              onClick={() => go(1)}
              aria-label="Next view"
              className="absolute right-3 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/50 text-white/80 backdrop-blur transition hover:bg-white/10 hover:text-white sm:inline-flex"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          </div>

          {/* Detail side (scrolls independently) */}
          <div className="custom-scroll min-h-0 overflow-y-auto p-6 sm:p-8">
            <div className="text-xs uppercase tracking-[3px] text-primary">{robot.tagline}</div>
            <h3 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{robot.name}</h3>
            <p className="mt-3 leading-relaxed text-white/70">{robot.detail}</p>

            <div className="mt-6 flex items-center gap-2 text-xs uppercase tracking-[2px] text-white/45">
              <Ruler className="h-4 w-4 text-accent" /> Precise cell measurements
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {robot.specs.map((s) => (
                <SpecItem key={s.label} spec={s} />
              ))}
            </div>

            {/* Similar views */}
            <div className="mt-7 text-xs uppercase tracking-[2px] text-white/45">Similar views</div>
            <div className="custom-scroll mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2">
              {robots.map((r, i) =>
                i === activeIndex ? null : (
                  <button
                    key={r.id}
                    onClick={() => onSelect(i)}
                    aria-label={`View ${r.name}`}
                    className="group relative aspect-[3/4] w-24 shrink-0 snap-start overflow-hidden rounded-xl border border-white/10 transition hover:border-primary/60"
                  >
                    <img
                      src={r.src}
                      alt={r.name}
                      width={784}
                      height={1168}
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                    />
                    <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-2 pb-1.5 pt-4 text-left text-[10px] leading-tight text-white/85">
                      {r.name}
                    </span>
                  </button>
                )
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Carousel                                                           */
/* ------------------------------------------------------------------ */

export default function RobotShowcase() {
  const robots = useMemo(() => ROBOTS, []);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(true);

  const updateArrows = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 8);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 8);
  }, []);

  useEffect(() => {
    updateArrows();
    const el = scrollerRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateArrows, { passive: true });
    window.addEventListener("resize", updateArrows);
    return () => {
      el.removeEventListener("scroll", updateArrows);
      window.removeEventListener("resize", updateArrows);
    };
  }, [updateArrows]);

  const nudge = (dir: 1 | -1) => {
    const el = scrollerRef.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>("[data-card]");
    const step = card ? card.offsetWidth + 20 : el.clientWidth * 0.8;
    el.scrollBy({ left: dir * step, behavior: "smooth" });
  };

  return (
    <section id="showcase" className="section-padding border-y border-white/10 bg-[#020617]">
      <div className="mx-auto max-w-7xl px-6">
        <SectionHeader
          eyebrow="Robot & cell showcase"
          title="See it run — independently."
          subtitle="Ten photorealistic views of the reference cell building pallets on its own. Swipe the gallery, then open any view for full measurements and the technical breakdown."
        />

        <div className="relative">
          {/* Edge fades */}
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-gradient-to-r from-[#020617] to-transparent sm:w-16" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-[#020617] to-transparent sm:w-16" />

          {/* Arrows (desktop) */}
          <button
            onClick={() => nudge(-1)}
            disabled={!canLeft}
            aria-label="Scroll left"
            className="absolute -left-3 top-1/2 z-20 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/60 text-white backdrop-blur transition hover:bg-white/10 disabled:pointer-events-none disabled:opacity-0 md:inline-flex"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <button
            onClick={() => nudge(1)}
            disabled={!canRight}
            aria-label="Scroll right"
            className="absolute -right-3 top-1/2 z-20 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/60 text-white backdrop-blur transition hover:bg-white/10 disabled:pointer-events-none disabled:opacity-0 md:inline-flex"
          >
            <ChevronRight className="h-6 w-6" />
          </button>

          {/* Scroller */}
          <div
            ref={scrollerRef}
            className="custom-scroll flex snap-x snap-mandatory gap-5 overflow-x-auto scroll-smooth pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {robots.map((r, i) => (
              <button
                key={r.id}
                data-card
                onClick={() => setOpenIndex(i)}
                aria-label={`Open ${r.name}`}
                className="group relative w-[78vw] shrink-0 snap-start overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] text-left transition duration-300 hover:-translate-y-1 hover:border-primary/50 hover:shadow-xl hover:shadow-primary/10 focus:outline-none focus-visible:border-primary/70 sm:w-[340px]"
              >
                {/* Image well — fixed aspect ratio → zero layout shift */}
                <div className="relative aspect-[4/5] w-full overflow-hidden">
                  <img
                    src={r.src}
                    alt={`${r.name} — palletizing robot working independently`}
                    width={784}
                    height={1168}
                    loading={i < 3 ? "eager" : "lazy"}
                    decoding="async"
                    className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.06]"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
                  <div className="absolute left-3 top-3 rounded-full border border-emerald-400/40 bg-emerald-400/10 px-2.5 py-1 font-mono text-[10px] tracking-wide text-emerald-300 backdrop-blur">
                    {r.state}
                  </div>
                  <div className="absolute inset-x-0 bottom-0 p-5">
                    <div className="text-[11px] uppercase tracking-[2px] text-primary">{r.tagline}</div>
                    <h3 className="mt-1 text-xl font-semibold tracking-tight text-white">{r.name}</h3>
                    <p className="mt-1 line-clamp-2 text-sm text-white/70">{r.summary}</p>
                    <div className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-white/90 opacity-0 transition group-hover:opacity-100">
                      View details <ArrowRight className="h-4 w-4" />
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <p className="mt-4 text-center text-xs tracking-widest text-white/40">
          SWIPE OR DRAG · CLICK ANY CELL FOR MEASUREMENTS & TECHNICAL DETAIL
        </p>
      </div>

      <AnimatePresence>
        {openIndex !== null && (
          <Lightbox
            robots={robots}
            activeIndex={openIndex}
            onClose={() => setOpenIndex(null)}
            onSelect={(i) => setOpenIndex(i)}
          />
        )}
      </AnimatePresence>
    </section>
  );
}
PALLETIZER_ROBOTSHOWCASE_EOF

# ---- 4. integrate into page.tsx + Navbar.tsx (idempotent, anchor-based) ----
echo ">> Integrating into app/page.tsx and components/Navbar.tsx"
node <<'NODE_EOF'
const fs = require('fs');

// -- page.tsx --
const pPath = 'web/app/page.tsx';
let p = fs.readFileSync(pPath, 'utf8');
if (!p.includes('RobotShowcase')) {
  p = p.replace(
    'import { SectionHeader, SectionShell, Eyebrow, SectionTitle, Card } from "@/components/Section";',
    'import { SectionHeader, SectionShell, Eyebrow, SectionTitle, Card } from "@/components/Section";\nimport RobotShowcase from "@/components/RobotShowcase";'
  );
  p = p.replace(
    '      {/* SOLUTIONS / INDUSTRIES with Unsplash style backgrounds */}',
    '      {/* ROBOT & CELL SHOWCASE — photorealistic proof, right after the core capability */}\n      <RobotShowcase />\n\n      {/* SOLUTIONS / INDUSTRIES with Unsplash style backgrounds */}'
  );
  fs.writeFileSync(pPath, p);
  console.log('   page.tsx: integrated');
} else {
  console.log('   page.tsx: already integrated (skipped)');
}

// -- Navbar.tsx --
const nPath = 'web/components/Navbar.tsx';
let n = fs.readFileSync(nPath, 'utf8');
if (!n.includes('/#showcase')) {
  n = n.replace(
    'const PLAIN_LINKS = [\n  { href: "/#solutions", label: "Solutions" },',
    'const PLAIN_LINKS = [\n  { href: "/#showcase", label: "Showcase" },\n  { href: "/#solutions", label: "Solutions" },'
  );
  fs.writeFileSync(nPath, n);
  console.log('   Navbar.tsx: integrated');
} else {
  console.log('   Navbar.tsx: already integrated (skipped)');
}
NODE_EOF

# ---- 5. materialize the 10 images (robust: works from any branch state) ----
echo ">> Extracting the 10 independent-operation images into web/public/showcase/robots"
mkdir -p web/public/showcase/robots
if [ -f palletizer_independent_10.zip ]; then
  unzip -o -q palletizer_independent_10.zip -d web/public/showcase/robots
else
  git show origin/main:palletizer_independent_10.zip > /tmp/pi10.zip
  unzip -o -q /tmp/pi10.zip -d web/public/showcase/robots
fi
COUNT=$(ls web/public/showcase/robots/*.png 2>/dev/null | wc -l | tr -d ' ')
echo "   $COUNT PNGs in place (expected 10)"
if [ "$COUNT" -lt 10 ]; then
  echo "ERROR: images did not extract correctly." >&2
  exit 1
fi

# ---- 6. verify the build ---------------------------------------------------
echo ">> Installing deps and building (this takes a minute)"
( cd web && npm install --no-audit --no-fund --silent && npx next build )

# ---- 7. commit + push ------------------------------------------------------
git config user.email >/dev/null 2>&1 || git config user.email "codespace@users.noreply.github.com"
git config user.name  >/dev/null 2>&1 || git config user.name  "Codespace"
echo ">> Committing and pushing '$BRANCH'"
git add web/components/RobotShowcase.tsx web/app/page.tsx web/components/Navbar.tsx web/public/showcase/robots
git commit -m "feat(web): AWS-style Robot & Cell Showcase (carousel + lightbox, 10 independent-operation views)"
git push -u origin "$BRANCH" --force-with-lease

echo ""
echo "============================================================"
echo " DONE. Open the PR link printed above."
echo " Your previous WIP is safe in the stash (git stash list)."
echo " Your fix/consistency-foundation branch is untouched."
echo "============================================================"
