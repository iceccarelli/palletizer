// Single source of truth for plans + Canadian tax handling, shared by the
// pricing UI and the Stripe checkout route. Prices are display-only here; the
// authoritative amount lives on the Stripe Price object referenced by priceId.

export type Currency = 'CAD' | 'USD';

export interface Plan {
  id: 'pro';
  name: string;
  /** Stripe Price IDs per currency, injected from env at build/runtime. */
  priceEnv: Record<Currency, string>;
  /** Display base (pre-tax) monthly, billed annually. */
  display: Record<Currency, number>;
}

// Ontario HST. Applied for display estimates only — Stripe Tax computes the
// authoritative, jurisdiction-correct amount at checkout via automatic_tax.
export const ONTARIO_HST_RATE = 0.13;

export const PRO_PLAN: Plan = {
  id: 'pro',
  name: 'Pro / Team',
  priceEnv: {
    CAD: 'NEXT_PUBLIC_STRIPE_PRICE_PRO_CAD',
    USD: 'NEXT_PUBLIC_STRIPE_PRICE_PRO_USD',
  },
  display: { CAD: 1190, USD: 890 },
};

export function formatMoney(amount: number, currency: Currency): string {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

/** Estimated HST line for CAD display. Returns 0 for non-Canadian currency. */
export function estimatedHst(amount: number, currency: Currency): number {
  return currency === 'CAD' ? Math.round(amount * ONTARIO_HST_RATE) : 0;
}
