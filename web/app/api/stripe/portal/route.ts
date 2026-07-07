// POST /api/stripe/portal
// Returns a Stripe Billing Portal URL for the signed-in user to manage their
// subscription, payment method, and invoices.
import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
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
