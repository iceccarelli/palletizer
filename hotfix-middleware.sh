#!/usr/bin/env bash
# Palletizer — hotfix: middleware must never crash the site (500 MIDDLEWARE_INVOCATION_FAILED)
# plus graceful degradation for /billing + stripe routes when env is unconfigured.
set -euo pipefail
if [ ! -f web/package.json ]; then echo "Run from the palletizer repo root."; exit 1; fi
echo "Applying hotfix..."

mkdir -p "web/lib/supabase"
cat > web/lib/supabase/config.ts << 'PALLETIZER_EOF'
// True only when Supabase auth env vars are present. Used to degrade gracefully
// (never crash) before Supabase is configured in the deployment environment.
export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
PALLETIZER_EOF
echo "  fixed web/lib/supabase/config.ts"

mkdir -p "web/lib/supabase"
cat > web/lib/supabase/middleware.ts << 'PALLETIZER_EOF'
// Refreshes the Supabase auth session and gates protected routes.
//
// CRITICAL: this runs on every request. It must NEVER throw, or the entire site
// returns 500 (MIDDLEWARE_INVOCATION_FAILED). If Supabase env vars are absent,
// or any auth call fails, we pass the request through unchanged.
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PROTECTED_PREFIXES = ['/billing', '/dashboard'];

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Auth not configured yet — never gate, never crash. Site behaves as before.
  if (!url || !anon) return response;

  try {
    const supabase = createServerClient(url, anon, {
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
    });

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const path = request.nextUrl.pathname;
    const isProtected = PROTECTED_PREFIXES.some((p) => path.startsWith(p));

    if (isProtected && !user) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = '/signin';
      redirectUrl.searchParams.set('next', path);
      return NextResponse.redirect(redirectUrl);
    }

    return response;
  } catch (err) {
    // Auth backend hiccup must not take down the site — fail open.
    console.error('[middleware] session refresh failed; passing through', err);
    return NextResponse.next({ request });
  }
}
PALLETIZER_EOF
echo "  fixed web/lib/supabase/middleware.ts"

mkdir -p "web/app/billing"
cat > web/app/billing/page.tsx << 'PALLETIZER_EOF'
// Protected billing page. Middleware redirects unauthenticated users to /signin.
// Shows current subscription state and a link into the Stripe Billing Portal.
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { redirect } from 'next/navigation';
import PortalButton from './PortalButton';

export const dynamic = 'force-dynamic';

export default async function BillingPage() {
  if (!isSupabaseConfigured()) redirect('/pricing');

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/signin?next=/billing');

  const { data: sub } = await supabase
    .from('subscriptions')
    .select('status, price_id, current_period_end, cancel_at_period_end')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const active = sub && ['active', 'trialing'].includes(sub.status);

  return (
    <div className="min-h-screen bg-[#0f172a] pt-24 pb-20 px-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-4xl font-semibold tracking-tighter">Billing</h1>
        <p className="text-white/60 mt-2">Signed in as {user.email}</p>

        <div className="glass p-7 rounded-3xl border border-white/10 mt-8">
          <div className="font-mono text-xs tracking-widest text-white/60">CURRENT PLAN</div>
          <div className="text-2xl font-semibold mt-1">
            {active ? 'Pro / Team' : 'Open Core (Free)'}
          </div>
          {sub && (
            <div className="text-sm text-white/60 mt-3 space-y-1">
              <div>Status: <span className="text-white/80">{sub.status}</span></div>
              {sub.current_period_end && (
                <div>
                  {sub.cancel_at_period_end ? 'Access ends' : 'Renews'}:{' '}
                  <span className="text-white/80">
                    {new Date(sub.current_period_end).toLocaleDateString('en-CA')}
                  </span>
                </div>
              )}
            </div>
          )}
          <div className="mt-6">
            {active ? (
              <PortalButton />
            ) : (
              <a href="/pricing" className="inline-block py-3 px-5 bg-primary text-primary-foreground font-semibold rounded-2xl">
                Upgrade to Pro
              </a>
            )}
          </div>
        </div>

        <p className="text-xs text-white/50 mt-6">
          Prices for Canadian customers include Ontario HST (13%), calculated at checkout by Stripe Tax.
        </p>
      </div>
    </div>
  );
}
PALLETIZER_EOF
echo "  fixed web/app/billing/page.tsx"

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
import { isSupabaseConfigured } from '@/lib/supabase/config';

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
  if (!isSupabaseConfigured() || !process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: 'Billing is not configured yet.' }, { status: 503 });
  }
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
import { isSupabaseConfigured } from '@/lib/supabase/config';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured() || !process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: 'Billing is not configured yet.' }, { status: 503 });
  }
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

echo ""; echo "Done. Verify: cd web && npx tsc --noEmit && npx next build"
