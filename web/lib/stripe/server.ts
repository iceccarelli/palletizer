// Server-only Stripe SDK instance. Never expose the secret key to the client.
import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
  // Fail fast in server contexts rather than sending a broken request to Stripe.
  // (Guarded so a missing key surfaces clearly in logs, not as a cryptic 500.)
  console.warn('[stripe] STRIPE_SECRET_KEY is not set — checkout will fail until configured.');
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', {
  apiVersion: '2025-05-28.basil',
  typescript: true,
  appInfo: { name: 'Palletizer', url: 'https://palletizer-app.vercel.app' },
});
