# Site Shell Blueprint — Header · Footer · Assistant

The reusable pattern behind palletizer-app.vercel.app's shell, modeled on the
information architecture of aws.amazon.com and adapted to this brand. Copy
this structure to any product site; keep the rules, swap the content.

## Footer anatomy (top → bottom)

```
┌──────────────────────────────────────────────────────────────┐
│                       ↑ BACK TO TOP  (full-width, quiet)     │
├──────────────────────────────────────────────────────────────┤
│  Product        Developers      Evaluate        Company      │
│  · 6 demo links · GitHub        · ROI Calc      · Contact    │
│  · Live Optim.  · Source file   · Pricing       · Sign in    │
│                 · API contract  · Missions      · Terms      │
│                 · Parity proof  · Pilot CTA     · Privacy    │
├──────────────────────────────────────────────────────────────┤
│         Trust line (the one-sentence product thesis)         │
├──────────────────────────────────────────────────────────────┤
│  Privacy · Site terms · © line          [9 social marks]     │
└──────────────────────────────────────────────────────────────┘
```

## The rules that make it professional

1. **Four columns, ~4–7 links each.** More columns reads as clutter; fewer
   reads as a startup with nothing to show. Every link must resolve — a
   footer link that 404s costs more trust than its absence.
2. **One column belongs to Developers** if the product has any technical
   audience. Link the actual source files, not just the repo root — "read
   the 376-line optimizer" converts skeptics better than any copy.
3. **Trust line before the legal line.** One sentence, the product thesis.
   AWS uses this slot for their corporate statement; a product uses it for
   the claim it can defend. Ours: *"Every metric on this site is derived
   from geometry — no canned animations, no invented numbers."*
4. **Nine social marks, one config file.** `web/lib/social.ts` is the single
   source of truth, with three honest stages per platform: empty url →
   dimmed, unlinked, "launching soon" tooltip; platform landing page →
   clickable placeholder while the campaign spins up (never a dead profile
   link); profile URL → fully live. Upgrading a platform is a one-line
   edit. Claim the identical handle everywhere before posting (ours:
   `@palletizerapp`). Order (most-used, B2B-weighted): X, LinkedIn,
   YouTube, Instagram, Facebook, TikTok, WhatsApp, GitHub, Email.
5. **Legal line format** (AWS convention, adopted):
   `© 2026, Grimaldi Engineering Services, Inc. or its affiliates. All rights reserved.`
   Defined once in `web/lib/social.ts` as `COPYRIGHT_LINE`; the footer and
   any other surface import it — never retype a legal line.

## Header anatomy

```
┌──────────────────────────────────────────────────────────────┐
│ thin utility bar: tagline ······· GitHub · Docs · Contact us │
├──────────────────────────────────────────────────────────────┤
│ Logo   Product ▾  Developers ▾  Solutions  Pricing           │
│                       Sign in  [Try Live Demo] [Request pilot]│
└──────────────────────────────────────────────────────────────┘
```

- Mega-menu links carry **one-line descriptions** (the AWS pattern that
  makes menus self-explanatory). Two panels max; each panel two columns.
- Two CTAs, visually distinct: primary action (demo) and revenue action
  (pilot) — mirrors AWS's "Sign in to console" / "Create account" split.
- Escape / outside-click closes; mobile gets accordions, not hover.

## Assistant anatomy (the "Ask AWS" pattern)

```
┌──────────────────────────────┐
│ gradient hero:               │
│  Ask Palletizer  [badge]     │
│  one-line subtitle           │
│  [ input inside the hero ]   │
├──────────────────────────────┤
│ Want help getting started?   │
│ [ stacked suggestion pills ] │
│ …conversation…               │
├──────────────────────────────┤
│ disclaimer line → /terms     │
└──────────────────────────────┘
```

- Launcher: fixed bottom-right, **pulsating ring** for attention.
- **Honesty is architectural, not aspirational:** the system prompt
  (`web/app/api/assistant/route.ts`) contains only verified facts about the
  product including a known-limitations list, and instructs the model to say
  "I don't know" + link the repo instead of inventing. Without an API key it
  falls back to a deterministic rule router — and the badge says so.
- Env: `ANTHROPIC_API_KEY` (server-side only). Model override:
  `ASSISTANT_MODEL`.

## Reusing on another site

1. Copy `components/{Navbar,Footer,SocialRow,AssistantWidget}.tsx`,
   `lib/social.ts`, `app/api/assistant/route.ts`.
2. Rewrite `lib/social.ts` (handles, entity) and the two menu definitions in
   `Navbar.tsx`; rewrite the assistant system prompt with THAT product's
   verified facts — never carry facts across products.
3. Keep the rules above. The layout is the commodity; the discipline
   (real links, dimmed unlaunched socials, grounded assistant) is the brand.
