"use client";

// Robot & Cell Showcase — AWS-product-page-style gallery.
// Three views over the full image library, one shared lightbox:
//   • Featured   — 10 curated "cells" with rich specs + technical write-ups (carousel)
//   • All cells  — every photorealistic autonomous-operation shot (load-more grid)
//   • Feature story — the 12 purpose-built marketing images with themed captions
// Reuses sitewide tokens only: glass, rounded-3xl, border-white/10,
// SectionHeader, font-mono specs, primary/accent, framer-motion, lucide-react.
// WebP thumbnails in the grid, full-res only in the lightbox → tiny initial load,
// zero layout shift (every image sits in a fixed aspect-ratio well).

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight, ChevronLeft, ChevronRight, X,
  Ruler, Gauge, Weight, Repeat, Move3d, Grip, Boxes,
} from "lucide-react";
import { SectionHeader } from "@/components/Section";
import { GALLERY, FEATURE_STORY } from "@/lib/showcaseManifest";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type Spec = { icon: React.ElementType; label: string; value: string };

// One shape the lightbox understands, whichever tab it came from.
type Item = {
  src: string;
  thumb: string;
  title: string;
  tagline?: string;
  state?: string;
  summary?: string;
  detail?: string;
  specs?: Spec[];
};

// Reference-cell specs shown on any robot image that has no bespoke block.
const REFERENCE_SPECS: Spec[] = [
  { icon: Ruler, label: "Reach", value: "1300 mm" },
  { icon: Weight, label: "Payload", value: "12.5 kg" },
  { icon: Gauge, label: "Throughput", value: "120 cases/hr" },
  { icon: Repeat, label: "Repeatability", value: "±0.05 mm" },
  { icon: Move3d, label: "Footprint", value: "2.4 × 2.4 m" },
  { icon: Boxes, label: "Pallet", value: "EUR 1200 × 800" },
];

/* ------------------------------------------------------------------ */
/*  Featured cells (curated, hand-authored)                            */
/* ------------------------------------------------------------------ */

const FEATURED: Item[] = [
  {
    src: "/showcase/featured/01.webp", thumb: "/showcase/featured/01@t.webp",
    title: "Full-Cell Overview", tagline: "Autonomous end-of-line build", state: "RUNNING · pallet 1 of 2",
    summary: "6-axis arm building a stringer pallet unattended, racking behind.",
    detail: "The cell runs the shipped edge orchestrator with no operator in the loop: cases are indexed off the infeed, vision confirms each pick above the 0.95 confidence gate, and the arm places to a physics-validated pattern. Cloud loss falls back to the local pattern cache, so the pallet completes even offline.",
    specs: [
      { icon: Ruler, label: "Reach", value: "1300 mm" }, { icon: Weight, label: "Payload", value: "12.5 kg" },
      { icon: Gauge, label: "Throughput", value: "120 cases/hr" }, { icon: Repeat, label: "Repeatability", value: "±0.05 mm" },
      { icon: Move3d, label: "Cell footprint", value: "2.4 × 2.4 m" }, { icon: Boxes, label: "Pallet format", value: "EUR 1200 × 800 mm" },
    ],
  },
  {
    src: "/showcase/featured/02.webp", thumb: "/showcase/featured/02@t.webp",
    title: "Infeed Pick", tagline: "Powered-conveyor case acquisition", state: "MOVING · pick z-clear 0.98",
    summary: "Vacuum tooling lifting a case straight off the powered infeed.",
    detail: "A metered infeed presents one case at a time. The gripper seals, lifts to a fixed z-clearance, then commits to the placement move only after the vision frame clears the confidence gate — the same interlock exposed in the live cell demo. No autonomous write happens on a low-confidence frame; the case is re-imaged first.",
    specs: [
      { icon: Grip, label: "End effector", value: "Dual-zone vacuum" }, { icon: Weight, label: "Payload", value: "12.5 kg" },
      { icon: Gauge, label: "Pick rate", value: "≈ 2.0 s / case" }, { icon: Repeat, label: "Placement acc.", value: "±0.05 mm" },
      { icon: Ruler, label: "Case range", value: "150–600 mm L" }, { icon: Move3d, label: "Approach", value: "Top-down, guarded" },
    ],
  },
  {
    src: "/showcase/featured/03.webp", thumb: "/showcase/featured/03@t.webp",
    title: "Mixed-SKU Layer Build", tagline: "Live density optimization", state: "RUNNING · layer 3, 18.7% uplift",
    summary: "Arm placing onto a partially built mixed-SKU layer.",
    detail: "The optimizer solves case order and orientation live, so heavier and larger SKUs anchor lower layers while the stability score stays at target. This is the one hard capability rendered in the physical world: a validated 3D plan turned into interlock and column stability on a real stack.",
    specs: [
      { icon: Boxes, label: "SKU mix", value: "Up to 40 / order" }, { icon: Gauge, label: "Density uplift", value: "+18.7% vs naive" },
      { icon: Weight, label: "Layer mass", value: "≤ 280 kg" }, { icon: Repeat, label: "Stability score", value: "1.00 target" },
      { icon: Ruler, label: "Reach", value: "1300 mm" }, { icon: Move3d, label: "Pattern", value: "Interlocked columns" },
    ],
  },
  {
    src: "/showcase/featured/04.webp", thumb: "/showcase/featured/04@t.webp",
    title: "Guarded Line-End Cell", tagline: "Perimeter-safe autonomy", state: "RUNNING · guard OK",
    summary: "Arm working inside perimeter fencing at the conveyor end.",
    detail: "A guarded end-of-line footprint with light-curtain entry. If the safety heartbeat freezes, the watchdog latches FAULT_ESTOP within 2.5 s rather than moving blind — motion only re-arms after the guard state and a fresh vision frame both clear. Full audit trail is written per placement.",
    specs: [
      { icon: Move3d, label: "Guarding", value: "Fence + light curtain" }, { icon: Gauge, label: "E-stop latch", value: "≤ 2.5 s" },
      { icon: Repeat, label: "Repeatability", value: "±0.05 mm" }, { icon: Weight, label: "Payload", value: "12.5 kg" },
      { icon: Ruler, label: "Reach", value: "1300 mm" }, { icon: Boxes, label: "Audit", value: "Per-placement log" },
    ],
  },
  {
    src: "/showcase/featured/05.webp", thumb: "/showcase/featured/05@t.webp",
    title: "Completed Pallet · Dual Station", tagline: "No-stop pallet changeover", state: "RUNNING · station B active",
    summary: "Finished stack beside the arm as it feeds the second station.",
    detail: "Two pallet positions let the cell keep building while a completed pallet waits for pickup — throughput never stalls on a changeover. The completed stack shows the interlocked column pattern the optimizer produced, ready for stretch-wrap and dispatch.",
    specs: [
      { icon: Boxes, label: "Stations", value: "2 × pallet" }, { icon: Gauge, label: "Throughput", value: "120 cases/hr" },
      { icon: Move3d, label: "Changeover", value: "No-stop" }, { icon: Weight, label: "Pallet load", value: "≤ 1000 kg" },
      { icon: Ruler, label: "Stack height", value: "≤ 2100 mm" }, { icon: Repeat, label: "Pattern", value: "Validated columns" },
    ],
  },
  {
    src: "/showcase/featured/06.webp", thumb: "/showcase/featured/06@t.webp",
    title: "Lights-Out Night Shift", tagline: "Unattended off-hours running", state: "RUNNING · unattended",
    summary: "Arm palletizing under warm facility lighting, no operators present.",
    detail: "Lights-out operation is the payback lever: the same cell runs the off-shift with no staffing. Local pattern cache plus the edge state machine keep it autonomous through transient network loss, and every cycle is logged for the morning audit.",
    specs: [
      { icon: Gauge, label: "Uptime target", value: "≥ 95%" }, { icon: Move3d, label: "Operation", value: "Lights-out" },
      { icon: Repeat, label: "Offline mode", value: "Local cache" }, { icon: Weight, label: "Payload", value: "12.5 kg" },
      { icon: Ruler, label: "Reach", value: "1300 mm" }, { icon: Boxes, label: "Payback", value: "8–18 months" },
    ],
  },
  {
    src: "/showcase/featured/07.webp", thumb: "/showcase/featured/07@t.webp",
    title: "Layer Placement Close-Up", tagline: "Flush, gap-free seating", state: "PLACING · dx −0.4 dy 0.2 mm",
    summary: "Case set flush against the layer with sub-millimetre correction.",
    detail: "A close view of the seating move: vision computes an in-plane correction and the controller writes it before contact, so cases land flush with minimal gaps. Tight seating is what turns a density plan on paper into a stable, ship-ready pallet.",
    specs: [
      { icon: Repeat, label: "Correction", value: "Sub-mm, in-plane" }, { icon: Ruler, label: "Placement acc.", value: "±0.05 mm" },
      { icon: Grip, label: "End effector", value: "Vacuum + guides" }, { icon: Gauge, label: "Confidence gate", value: "≥ 0.95" },
      { icon: Weight, label: "Case mass", value: "≤ 12.5 kg" }, { icon: Move3d, label: "Seating", value: "Force-aware" },
    ],
  },
  {
    src: "/showcase/featured/08.webp", thumb: "/showcase/featured/08@t.webp",
    title: "Twin-Pallet Wide Cell", tagline: "Multi-position layout", state: "RUNNING · 2 lanes",
    summary: "Wide cell servicing multiple pallet positions from one arm.",
    detail: "One arm, multiple pallet lanes: the optimizer sequences placements across positions to keep the arm in continuous motion. The same RobotInterface driver (under 100 lines) that runs this layout runs any supported arm — one codebase, any robot.",
    specs: [
      { icon: Boxes, label: "Lanes", value: "2–3 pallet" }, { icon: Move3d, label: "Footprint", value: "3.0 × 2.4 m" },
      { icon: Gauge, label: "Throughput", value: "120+ cases/hr" }, { icon: Grip, label: "Driver", value: "< 100 LOC" },
      { icon: Ruler, label: "Reach", value: "1300 mm" }, { icon: Repeat, label: "Repeatability", value: "±0.05 mm" },
    ],
  },
  {
    src: "/showcase/featured/09.webp", thumb: "/showcase/featured/09@t.webp",
    title: "High-Density Top-Off", tagline: "Tall, dense, stable stacks", state: "RUNNING · top layer",
    summary: "Arm topping a tall, high-density pallet with warehouse depth behind.",
    detail: "The final layers are where instability usually shows up; here the validated pattern holds column stability to the top of a full stack. Denser pallets mean fewer truck rolls — the density uplift compounds straight into freight savings.",
    specs: [
      { icon: Ruler, label: "Stack height", value: "≤ 2100 mm" }, { icon: Gauge, label: "Density uplift", value: "+18.7%" },
      { icon: Weight, label: "Pallet load", value: "≤ 1000 kg" }, { icon: Repeat, label: "Stability score", value: "1.00" },
      { icon: Boxes, label: "Freight", value: "Fewer truck rolls" }, { icon: Move3d, label: "Pattern", value: "Interlocked" },
    ],
  },
  {
    src: "/showcase/featured/10.webp", thumb: "/showcase/featured/10@t.webp",
    title: "Food-Grade Sanitary Cell", tagline: "Washdown-ready hygiene", state: "RUNNING · sanitary mode",
    summary: "Gripper over a pallet in a bright, hygiene-critical facility.",
    detail: "A hygiene-critical layout with washdown-rated tooling and full traceability for audits. Validated patterns plus per-case logs give food & beverage and pharma lines the compliance trail they need — the same engine, tuned for a sanitary environment.",
    specs: [
      { icon: Grip, label: "Tooling", value: "Washdown-rated" }, { icon: Boxes, label: "Traceability", value: "Per-case log" },
      { icon: Repeat, label: "Compliance", value: "Audit-ready" }, { icon: Weight, label: "Payload", value: "12.5 kg" },
      { icon: Ruler, label: "Reach", value: "1300 mm" }, { icon: Gauge, label: "Throughput", value: "120 cases/hr" },
    ],
  },
];

// Manifest → Item[] for the other two tabs.
const CELLS: Item[] = GALLERY.map((g, i) => ({
  src: g.src, thumb: g.thumb, title: g.label,
  tagline: "Independent operation", state: "RUNNING",
  summary: `Autonomous palletizing cell — view ${String(i + 1).padStart(3, "0")}.`,
  specs: REFERENCE_SPECS,
}));

const STORY: Item[] = FEATURE_STORY.map((s) => ({
  src: s.src, thumb: s.thumb, title: s.title, tagline: "Feature", detail: s.desc,
}));

/* ------------------------------------------------------------------ */
/*  Small pieces                                                       */
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
  items, activeIndex, onClose, onSelect,
}: {
  items: Item[]; activeIndex: number; onClose: () => void; onSelect: (i: number) => void;
}) {
  const item = items[activeIndex];
  const specs = item.specs ?? (item.detail ? undefined : REFERENCE_SPECS);

  const go = useCallback(
    (dir: 1 | -1) => onSelect((activeIndex + dir + items.length) % items.length),
    [activeIndex, items.length, onSelect]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [go, onClose]);

  // Similar views = other items in the same list.
  const similar = items
    .map((it, i) => ({ it, i }))
    .filter(({ i }) => i !== activeIndex)
    .slice(0, 12);

  return (
    <motion.div
      className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-6"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
      role="dialog" aria-modal="true" aria-label={`${item.title} — details`}
    >
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose} aria-hidden="true" />
      <motion.div
        className="glass relative z-10 flex max-h-[92dvh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#0b1120]/80"
        initial={{ opacity: 0, scale: 0.96, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 8 }} transition={{ type: "spring", stiffness: 260, damping: 26 }}
      >
        <button onClick={onClose} aria-label="Close"
          className="absolute right-3 top-3 z-20 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-black/40 text-white/80 backdrop-blur transition hover:bg-white/10 hover:text-white">
          <X className="h-5 w-5" />
        </button>

        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[1.15fr_1fr]">
          {/* Image side */}
          <div className="relative flex items-center justify-center bg-[#060a13] p-4 sm:p-6">
            <div className="relative aspect-[3/4] w-full max-w-md overflow-hidden rounded-2xl border border-white/10">
              <AnimatePresence mode="wait">
                <motion.img
                  key={item.src} src={item.src} alt={`${item.title} — palletizing robot in independent operation`}
                  width={1100} height={1650} className="absolute inset-0 h-full w-full object-cover"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} decoding="async"
                />
              </AnimatePresence>
              {item.state && (
                <div className="pointer-events-none absolute left-3 top-3 rounded-full border border-emerald-400/40 bg-emerald-400/10 px-3 py-1 font-mono text-[10px] tracking-wide text-emerald-300">
                  {item.state}
                </div>
              )}
            </div>
            <button onClick={() => go(-1)} aria-label="Previous view"
              className="absolute left-3 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/50 text-white/80 backdrop-blur transition hover:bg-white/10 hover:text-white sm:inline-flex">
              <ChevronLeft className="h-6 w-6" />
            </button>
            <button onClick={() => go(1)} aria-label="Next view"
              className="absolute right-3 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/50 text-white/80 backdrop-blur transition hover:bg-white/10 hover:text-white sm:inline-flex">
              <ChevronRight className="h-6 w-6" />
            </button>
          </div>

          {/* Detail side */}
          <div className="custom-scroll min-h-0 overflow-y-auto p-6 sm:p-8">
            {item.tagline && <div className="text-xs uppercase tracking-[3px] text-primary">{item.tagline}</div>}
            <h3 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{item.title}</h3>
            {(item.detail || item.summary) && (
              <p className="mt-3 leading-relaxed text-white/70">{item.detail ?? item.summary}</p>
            )}

            {specs && (
              <>
                <div className="mt-6 flex items-center gap-2 text-xs uppercase tracking-[2px] text-white/45">
                  <Ruler className="h-4 w-4 text-accent" /> Reference cell measurements
                </div>
                <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {specs.map((s) => <SpecItem key={s.label} spec={s} />)}
                </div>
              </>
            )}

            <div className="mt-7 text-xs uppercase tracking-[2px] text-white/45">Similar views</div>
            <div className="custom-scroll mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2">
              {similar.map(({ it, i }) => (
                <button key={it.src} onClick={() => onSelect(i)} aria-label={`View ${it.title}`}
                  className="group relative aspect-[3/4] w-24 shrink-0 snap-start overflow-hidden rounded-xl border border-white/10 transition hover:border-primary/60">
                  <img src={it.thumb} alt={it.title} loading="lazy" decoding="async"
                    className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
                  <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-2 pb-1.5 pt-4 text-left text-[10px] leading-tight text-white/85">
                    {it.title}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Featured carousel                                                  */
/* ------------------------------------------------------------------ */

function Carousel({ items, onOpen }: { items: Item[]; onOpen: (i: number) => void }) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(true);

  const updateArrows = useCallback(() => {
    const el = scrollerRef.current; if (!el) return;
    setCanLeft(el.scrollLeft > 8);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 8);
  }, []);

  useEffect(() => {
    updateArrows();
    const el = scrollerRef.current; if (!el) return;
    el.addEventListener("scroll", updateArrows, { passive: true });
    window.addEventListener("resize", updateArrows);
    return () => { el.removeEventListener("scroll", updateArrows); window.removeEventListener("resize", updateArrows); };
  }, [updateArrows]);

  const nudge = (dir: 1 | -1) => {
    const el = scrollerRef.current; if (!el) return;
    const card = el.querySelector<HTMLElement>("[data-card]");
    const step = card ? card.offsetWidth + 20 : el.clientWidth * 0.8;
    el.scrollBy({ left: dir * step, behavior: "smooth" });
  };

  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-gradient-to-r from-[#020617] to-transparent sm:w-16" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-[#020617] to-transparent sm:w-16" />
      <button onClick={() => nudge(-1)} disabled={!canLeft} aria-label="Scroll left"
        className="absolute -left-3 top-1/2 z-20 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/60 text-white backdrop-blur transition hover:bg-white/10 disabled:pointer-events-none disabled:opacity-0 md:inline-flex">
        <ChevronLeft className="h-6 w-6" />
      </button>
      <button onClick={() => nudge(1)} disabled={!canRight} aria-label="Scroll right"
        className="absolute -right-3 top-1/2 z-20 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/60 text-white backdrop-blur transition hover:bg-white/10 disabled:pointer-events-none disabled:opacity-0 md:inline-flex">
        <ChevronRight className="h-6 w-6" />
      </button>

      <div ref={scrollerRef}
        className="custom-scroll flex snap-x snap-mandatory gap-5 overflow-x-auto scroll-smooth pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((r, i) => (
          <button key={r.src} data-card onClick={() => onOpen(i)} aria-label={`Open ${r.title}`}
            className="group relative w-[78vw] shrink-0 snap-start overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] text-left transition duration-300 hover:-translate-y-1 hover:border-primary/50 hover:shadow-xl hover:shadow-primary/10 focus:outline-none focus-visible:border-primary/70 sm:w-[340px]">
            <div className="relative aspect-[4/5] w-full overflow-hidden">
              <img src={r.thumb} alt={`${r.title} — palletizing robot working independently`}
                loading={i < 3 ? "eager" : "lazy"} decoding="async"
                className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.06]" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
              {r.state && (
                <div className="absolute left-3 top-3 rounded-full border border-emerald-400/40 bg-emerald-400/10 px-2.5 py-1 font-mono text-[10px] tracking-wide text-emerald-300 backdrop-blur">
                  {r.state}
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 p-5">
                {r.tagline && <div className="text-[11px] uppercase tracking-[2px] text-primary">{r.tagline}</div>}
                <h3 className="mt-1 text-xl font-semibold tracking-tight text-white">{r.title}</h3>
                {r.summary && <p className="mt-1 line-clamp-2 text-sm text-white/70">{r.summary}</p>}
                <div className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-white/90 opacity-0 transition group-hover:opacity-100">
                  View details <ArrowRight className="h-4 w-4" />
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Masonry-ish grid with load-more                                    */
/* ------------------------------------------------------------------ */

function Grid({ items, onOpen, step = 18 }: { items: Item[]; onOpen: (i: number) => void; step?: number }) {
  const [visible, setVisible] = useState(step);
  const shown = items.slice(0, visible);
  return (
    <>
      <div className="[column-fill:_balance] columns-2 gap-4 sm:columns-3 lg:columns-4">
        {shown.map((it, i) => (
          <button key={it.src} onClick={() => onOpen(i)} aria-label={`Open ${it.title}`}
            className="group mb-4 block w-full overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] text-left transition hover:-translate-y-0.5 hover:border-primary/50">
            <div className="relative aspect-[3/4] w-full overflow-hidden">
              <img src={it.thumb} alt={it.title} loading="lazy" decoding="async"
                className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.05]" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 transition group-hover:opacity-100" />
              <span className="absolute inset-x-0 bottom-0 p-3 text-sm font-medium text-white opacity-0 transition group-hover:opacity-100">
                {it.title}
              </span>
            </div>
          </button>
        ))}
      </div>
      {visible < items.length && (
        <div className="mt-8 text-center">
          <button onClick={() => setVisible((v) => v + step)}
            className="inline-flex items-center gap-2 rounded-2xl border border-white/20 px-8 py-3 text-sm font-semibold text-white transition hover:bg-white/5">
            Load more · {items.length - visible} remaining
          </button>
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Section                                                            */
/* ------------------------------------------------------------------ */

type Tab = "featured" | "cells" | "story";

export default function RobotShowcase() {
  const [tab, setTab] = useState<Tab>("featured");
  const [open, setOpen] = useState<number | null>(null);

  const lists = useMemo<Record<Tab, Item[]>>(
    () => ({ featured: FEATURED, cells: CELLS, story: STORY }), []
  );
  const items = lists[tab];

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: "featured", label: "Featured cells", count: FEATURED.length },
    { id: "cells", label: "All cells", count: CELLS.length },
    { id: "story", label: "Feature story", count: STORY.length },
  ];

  const switchTab = (t: Tab) => { setOpen(null); setTab(t); };

  return (
    <section id="showcase" className="section-padding border-y border-white/10 bg-[#020617]">
      <div className="mx-auto max-w-7xl px-6">
        <SectionHeader
          eyebrow="Robot & cell showcase"
          title="See it run — independently."
          subtitle="A full library of the reference cell building pallets on its own. Start with ten curated cells, browse every view, or walk the feature story — click any image for measurements and the technical breakdown."
        />

        {/* Tabs */}
        <div className="mb-8 flex flex-wrap justify-center gap-2">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => switchTab(t.id)}
              className={`inline-flex items-center gap-2 rounded-full border px-5 py-2 text-sm font-medium transition ${
                tab === t.id
                  ? "border-primary/60 bg-primary/15 text-white"
                  : "border-white/15 text-white/70 hover:bg-white/5 hover:text-white"
              }`}>
              {t.label}
              <span className="rounded-full bg-white/10 px-2 py-0.5 font-mono text-[11px] text-white/70">{t.count}</span>
            </button>
          ))}
        </div>

        {tab === "featured" && <Carousel items={items} onOpen={setOpen} />}
        {tab === "cells" && <Grid items={items} onOpen={setOpen} step={20} />}
        {tab === "story" && <Grid items={items} onOpen={setOpen} step={12} />}

        <p className="mt-6 text-center text-xs tracking-widest text-white/40">
          {tab === "featured"
            ? "SWIPE OR DRAG · CLICK ANY CELL FOR MEASUREMENTS & TECHNICAL DETAIL"
            : "CLICK ANY IMAGE TO OPEN THE FULL-RESOLUTION VIEW"}
        </p>
      </div>

      <AnimatePresence>
        {open !== null && (
          <Lightbox items={items} activeIndex={open} onClose={() => setOpen(null)} onSelect={setOpen} />
        )}
      </AnimatePresence>
    </section>
  );
}
