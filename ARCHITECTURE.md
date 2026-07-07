# Architecture — Auth, Payments & Automation

## Context (verified against the repo, not assumed)

The web app in `web/` is **Next.js 14 (App Router)** — not a Vite SPA. It already
uses native route handlers in `web/app/api/*/route.ts` (see `ingest`, `optimize`,
`assistant`, etc.). Therefore new backend endpoints are implemented as **native
App Router route handlers**, not as a separate root-level `/api` serverless folder.
This keeps one consistent API surface and avoids a redundant, harder-to-maintain
parallel structure.

Before this change, `/signin` was a **UI stub**: it simulated a magic link with a
`setTimeout` and a toast, and the OAuth buttons showed "coming soon". There was no
Supabase project, no session, and no user records. Real authentication is a
prerequisite for tying subscriptions to accounts, so it is implemented here as
part of the same change set rather than assumed to exist.

## What this change set adds

**Authentication (Supabase Auth)**
- `web/lib/supabase/{client,server,middleware}.ts` — browser, server (cookie-bound),
  and session-refresh clients via `@supabase/ssr`.
- `web/middleware.ts` — refreshes the session and gates `/billing` (and future
  `/dashboard`), redirecting anonymous users to `/signin`.
- `web/app/signin/page.tsx` — real magic-link + Google/GitHub OAuth.
- `web/app/auth/callback/route.ts` — exchanges the auth code for a session.

**Payments (Stripe, primary)**
- `web/app/api/stripe/checkout/route.ts` — subscription Checkout Session, auth-gated,
  server-side price allow-list, `automatic_tax` (HST/GST + US/EU), B2B tax-ID collection.
- `web/app/api/stripe/webhook/route.ts` — signature-verified; reconciles subscription
  state into Supabase via the service role; forwards events to n8n if configured.
- `web/app/api/stripe/portal/route.ts` — Stripe Billing Portal session.
- `web/components/CheckoutButton.tsx`, `web/app/billing/*` — purchase + manage UI.

**Data + tax**
- `supabase/migrations/0001_auth_billing.sql` — `profiles`, `subscriptions`, `leads`
  with **RLS**: users read only their own rows; writes are service-role only.
- `web/lib/pricing.ts` — single source of truth for plans and Ontario HST (13%) display.
- CAD/USD toggle on `/pricing`; Stripe Tax computes the authoritative tax at checkout.

**Automation seam (Rank 2)**
- `web/app/api/leads/route.ts` — enterprise leads → Supabase + n8n.
- Webhook + leads both POST to `N8N_WEBHOOK_URL` (best-effort, non-blocking).

## Security

- Webhook uses the raw body + `stripe.webhooks.constructEvent` signature check.
- Service-role key is server-only and never imported into client code.
- RLS on every table; all secrets via environment variables (`web/.env.example`).

## Deliberately deferred (not one-shotted here)

- **n8n deployment + 6 workflows** — requires a live VPS and third-party API
  credentials (X, YouTube, Resend, Slack). The webhook/lead seams are already in place.
- **PayPal** — add as a Stripe payment method first (lower complexity) before a
  separate integration.
- **Full Pro `/dashboard`** (history, teams, reports, API keys) — depends on this
  auth + subscription foundation, which now exists.
