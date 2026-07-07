#!/usr/bin/env bash
# Palletizer — build-fix for the 13 tsc errors + next build hardening.
# Run from repo root:  bash fix-build-errors.sh
set -euo pipefail
if [ ! -f web/package.json ]; then echo "Run from the palletizer repo root."; exit 1; fi
echo "Applying build fixes..."

mkdir -p "web/lib/stripe"
cat > web/lib/stripe/server.ts << 'PALLETIZER_EOF'
// Server-only Stripe accessor. Lazily instantiated so importing this module
// never constructs a client at build time (which would crash `next build` when
// no key is present). The client is created on first use inside a request and
// memoised thereafter. Never expose the secret key to the client.
import Stripe from 'stripe';

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY is not configured.');
  }
  // apiVersion omitted intentionally: the installed SDK pins the version its
  // types target, keeping `tsc` stable across dependency upgrades.
  _stripe = new Stripe(key, {
    typescript: true,
    appInfo: { name: 'Palletizer', url: 'https://palletizer-app.vercel.app' },
  });
  return _stripe;
}
PALLETIZER_EOF
echo "  fixed web/lib/stripe/server.ts"

mkdir -p "web/lib/supabase"
cat > web/lib/supabase/server.ts << 'PALLETIZER_EOF'
// Server-side Supabase client bound to the request cookies (App Router).
// Safe to use in Server Components, Route Handlers, and Server Actions.
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component — safe to ignore; middleware refreshes the session.
          }
        },
      },
    },
  );
}

// Privileged client using the service-role key. SERVER ONLY.
// Never import this into a Client Component. Used by the Stripe webhook to
// write subscription state regardless of the current user session.
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

export function createServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
PALLETIZER_EOF
echo "  fixed web/lib/supabase/server.ts"

mkdir -p "web/lib/supabase"
cat > web/lib/supabase/middleware.ts << 'PALLETIZER_EOF'
// Refreshes the Supabase auth session on every request and gates protected
// routes. Keeps the user's cookie fresh so Server Components see a valid session.
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PROTECTED_PREFIXES = ['/billing', '/dashboard'];

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isProtected = PROTECTED_PREFIXES.some((p) => path.startsWith(p));

  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = '/signin';
    url.searchParams.set('next', path);
    return NextResponse.redirect(url);
  }

  return response;
}
PALLETIZER_EOF
echo "  fixed web/lib/supabase/middleware.ts"

mkdir -p "web/app/api/stripe/checkout"
cat > web/app/api/stripe/checkout/route.ts << 'PALLETIZER_EOF'
// POST /api/stripe/checkout
// Creates a subscription Checkout Session for the signed-in user.
// Body: { priceId: string, currency?: 'CAD' | 'USD' }
//
// Security:
//  - Requires an authenticated Supabase session (no anonymous checkout).
//  - priceId is validated against the server-side allow-list of env price IDs,
//    so a caller cannot inject an arbitrary Stripe price.
//  - Stripe Tax (automatic_tax) computes HST/GST and US/EU tax at checkout.
import { NextRequest, NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

function allowedPriceIds(): Set<string> {
  return new Set(
    [
      process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_CAD,
      process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_USD,
    ].filter((v): v is string => Boolean(v)),
  );
}

export async function POST(req: NextRequest) {
  const stripe = getStripe();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'You must be signed in to subscribe.' }, { status: 401 });
  }

  let body: { priceId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const priceId = body.priceId;
  if (!priceId || !allowedPriceIds().has(priceId)) {
    return NextResponse.json({ error: 'Unknown or unconfigured price.' }, { status: 400 });
  }

  const origin = req.headers.get('origin') ?? process.env.NEXT_PUBLIC_SITE_URL ?? '';

  try {
    // Reuse a Stripe customer if we already created one for this user.
    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .maybeSingle();

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      customer: profile?.stripe_customer_id ?? undefined,
      customer_email: profile?.stripe_customer_id ? undefined : (user.email ?? undefined),
      client_reference_id: user.id,
      metadata: { supabase_user_id: user.id },
      subscription_data: { metadata: { supabase_user_id: user.id } },
      automatic_tax: { enabled: true },
      tax_id_collection: { enabled: true }, // B2B: collect GST/HST/VAT numbers.
      customer_update: profile?.stripe_customer_id ? { name: 'auto', address: 'auto' } : undefined,
      allow_promotion_codes: true,
      billing_address_collection: 'required',
      success_url: `${origin}/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/pricing?checkout=cancelled`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error('[stripe/checkout] error', err);
    return NextResponse.json({ error: 'Could not start checkout. Please try again.' }, { status: 500 });
  }
}
PALLETIZER_EOF
echo "  fixed web/app/api/stripe/checkout/route.ts"

mkdir -p "web/app/api/stripe/portal"
cat > web/app/api/stripe/portal/route.ts << 'PALLETIZER_EOF'
// POST /api/stripe/portal
// Returns a Stripe Billing Portal URL for the signed-in user to manage their
// subscription, payment method, and invoices.
import { NextRequest, NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const stripe = getStripe();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.stripe_customer_id) {
    return NextResponse.json({ error: 'No billing account yet.' }, { status: 400 });
  }

  const origin = req.headers.get('origin') ?? process.env.NEXT_PUBLIC_SITE_URL ?? '';
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${origin}/billing`,
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error('[stripe/portal] error', err);
    return NextResponse.json({ error: 'Could not open billing portal.' }, { status: 500 });
  }
}
PALLETIZER_EOF
echo "  fixed web/app/api/stripe/portal/route.ts"

mkdir -p "web/app/api/stripe/webhook"
cat > web/app/api/stripe/webhook/route.ts << 'PALLETIZER_EOF'
// POST /api/stripe/webhook
// Verifies the Stripe signature, then reconciles subscription state into
// Supabase using the service-role client (bypasses RLS intentionally — this is
// a trusted server context). Also forwards a compact event to n8n if configured.
//
// Handled events:
//   checkout.session.completed        -> link customer, mark active
//   customer.subscription.updated     -> sync status / period end / price
//   customer.subscription.deleted     -> mark cancelled
//   invoice.paid / invoice.payment_failed -> forwarded to n8n for dunning
import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { getStripe } from '@/lib/stripe/server';
import { createServiceClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

// n8n handoff (Rank 2). Best-effort; never blocks the webhook 200.
async function forwardToN8n(eventType: string, payload: unknown) {
  const url = process.env.N8N_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.N8N_WEBHOOK_TOKEN ? { 'x-n8n-token': process.env.N8N_WEBHOOK_TOKEN } : {}),
      },
      body: JSON.stringify({ source: 'stripe', type: eventType, data: payload }),
    });
  } catch (err) {
    console.error('[stripe/webhook] n8n forward failed', err);
  }
}

async function upsertSubscription(sub: Stripe.Subscription, userId?: string) {
  const db = createServiceClient();
  const resolvedUserId = userId ?? (sub.metadata?.supabase_user_id || undefined);
  if (!resolvedUserId) {
    console.warn('[stripe/webhook] subscription without supabase_user_id', sub.id);
    return;
  }
  const item = sub.items.data[0];
  await db.from('subscriptions').upsert(
    {
      user_id: resolvedUserId,
      stripe_subscription_id: sub.id,
      stripe_customer_id: typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
      status: sub.status,
      price_id: item?.price?.id ?? null,
      current_period_end: sub.current_period_end
        ? new Date(sub.current_period_end * 1000).toISOString()
        : null,
      cancel_at_period_end: sub.cancel_at_period_end,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'stripe_subscription_id' },
  );

  await db
    .from('profiles')
    .update({
      stripe_customer_id: typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
      tier: ['active', 'trialing'].includes(sub.status) ? 'pro' : 'free',
    })
    .eq('id', resolvedUserId);
}

export async function POST(req: NextRequest) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const sig = req.headers.get('stripe-signature');
  if (!secret || !sig) {
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 400 });
  }

  const rawBody = await req.text(); // Raw body required for signature verification.
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, secret);
  } catch (err) {
    console.error('[stripe/webhook] signature verification failed', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.client_reference_id ?? session.metadata?.supabase_user_id ?? undefined;
        if (session.subscription) {
          const sub = await stripe.subscriptions.retrieve(session.subscription as string);
          await upsertSubscription(sub, userId ?? undefined);
        }
        break;
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        await upsertSubscription(event.data.object as Stripe.Subscription);
        break;
      }
      default:
        break;
    }

    await forwardToN8n(event.type, event.data.object);
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error('[stripe/webhook] handler error', err);
    // Return 500 so Stripe retries transient failures.
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }
}
PALLETIZER_EOF
echo "  fixed web/app/api/stripe/webhook/route.ts"

mkdir -p "web/app/signin"
cat > web/app/signin/page.tsx << 'PALLETIZER_EOF'
"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { toast } from "sonner";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function SignInForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const params = useSearchParams();
  const next = params.get("next") ?? "/billing";

  const redirectTo = () =>
    `${typeof window !== "undefined" ? window.location.origin : ""}/auth/callback?next=${encodeURIComponent(next)}`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo() },
      });
      if (error) throw error;
      toast.success("Magic link sent!", {
        description: "Check " + email + " for a secure sign-in link.",
      });
    } catch (err) {
      toast.error("Could not send link", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  const oauth = async (provider: "google" | "github") => {
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: redirectTo() },
      });
      if (error) throw error;
    } catch (err) {
      toast.error("Sign-in failed", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f172a] pt-24 pb-12 px-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <Link href="/" className="inline-flex items-center gap-2 text-3xl font-semibold tracking-tighter">
            Palletizer
          </Link>
          <p className="text-white/60 mt-2">Sign in to access your plans, team workspace, and enterprise features.</p>
        </div>

        <div className="glass p-7 sm:p-9 rounded-3xl border border-white/10">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="text-xs tracking-widest text-white/60 block mb-1.5">WORK EMAIL</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="w-full bg-black/40 border border-white/20 focus:border-primary outline-none rounded-2xl px-5 py-3.5 text-lg placeholder:text-white/40"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 bg-primary text-primary-foreground font-semibold rounded-2xl text-lg disabled:opacity-70 flex items-center justify-center gap-2 active:scale-[0.985] transition"
            >
              {loading ? "Sending secure link..." : "Send Magic Link"}
            </button>
          </form>

          <div className="my-6 text-center text-xs text-white/50">or</div>

          <div className="space-y-3">
            <button onClick={() => oauth("google")} className="w-full py-3.5 border border-white/20 hover:bg-white/5 rounded-2xl flex items-center justify-center gap-3 text-sm font-medium transition">
              Continue with Google
            </button>
            <button onClick={() => oauth("github")} className="w-full py-3.5 border border-white/20 hover:bg-white/5 rounded-2xl flex items-center justify-center gap-3 text-sm font-medium transition">
              Continue with GitHub
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SignIn() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0f172a]" />}>
      <SignInForm />
    </Suspense>
  );
}
PALLETIZER_EOF
echo "  fixed web/app/signin/page.tsx"

echo ""; echo "Done. Now: cd web && npx tsc --noEmit && npx next build"
