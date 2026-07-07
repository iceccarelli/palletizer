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
import { stripe } from '@/lib/stripe/server';
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
