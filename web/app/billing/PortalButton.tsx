'use client';

import { useState } from 'react';
import { toast } from 'sonner';

export default function PortalButton() {
  const [loading, setLoading] = useState(false);
  const open = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        toast.error(data.error ?? 'Could not open billing portal.');
        return;
      }
      window.location.href = data.url;
    } catch {
      toast.error('Something went wrong.');
    } finally {
      setLoading(false);
    }
  };
  return (
    <button onClick={open} disabled={loading} className="py-3 px-5 bg-primary text-primary-foreground font-semibold rounded-2xl disabled:opacity-70">
      {loading ? 'Opening…' : 'Manage subscription & invoices'}
    </button>
  );
}
