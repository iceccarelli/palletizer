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
