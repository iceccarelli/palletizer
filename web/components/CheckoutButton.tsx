'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

interface CheckoutButtonProps {
  priceId: string | undefined;
  label: string;
  className?: string;
}

// Starts a Stripe Checkout session. If the user is not signed in, routes them
// to /signin first and returns them to pricing to complete purchase.
export default function CheckoutButton({ priceId, label, className }: CheckoutButtonProps) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const onClick = async () => {
    if (!priceId) {
      toast.error('This plan is not yet configured. Please contact sales.');
      return;
    }
    setLoading(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push('/signin?next=/pricing');
        return;
      }

      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        toast.error(data.error ?? 'Could not start checkout.');
        return;
      }
      window.location.href = data.url;
    } catch {
      toast.error('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button onClick={onClick} disabled={loading} className={className}>
      {loading ? 'Redirecting to secure checkout…' : label}
    </button>
  );
}
