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
import { stripe } from '@/lib/stripe/server';
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
      current_period_end: item?.current_period_end
        ? new Date(item.current_period_end * 1000).toISOString()
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
