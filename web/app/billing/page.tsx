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
