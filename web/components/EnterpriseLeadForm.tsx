'use client';

import { useState } from 'react';
import { toast } from 'sonner';

// Enterprise "Talk to Sales" lead form. Posts to /api/leads (Supabase + n8n).
export default function EnterpriseLeadForm() {
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', company: '', volume: '', message: '' });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    if (!form.name.trim() || !form.email.trim()) {
      toast.error('Name and work email are required.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, source: 'pricing_enterprise' }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        toast.error(data.error ?? 'Could not submit.');
        return;
      }
      toast.success('Thanks — our team will reach out within one business day.');
      setForm({ name: '', email: '', company: '', volume: '', message: '' });
    } catch {
      toast.error('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const input =
    'w-full bg-black/40 border border-white/20 focus:border-primary outline-none rounded-2xl px-4 py-3 text-sm placeholder:text-white/40';

  return (
    <div className="glass p-7 rounded-3xl border border-white/10 max-w-xl mx-auto text-left">
      <div className="font-mono text-xs tracking-widest text-white/60 mb-4">ENTERPRISE — TALK TO SALES</div>
      <div className="space-y-3">
        <input className={input} placeholder="Full name *" value={form.name} onChange={set('name')} />
        <input className={input} type="email" placeholder="Work email *" value={form.email} onChange={set('email')} />
        <input className={input} placeholder="Company" value={form.company} onChange={set('company')} />
        <input className={input} placeholder="Approx. cases / pallets per day" value={form.volume} onChange={set('volume')} />
        <textarea className={input} rows={3} placeholder="What are you trying to automate?" value={form.message} onChange={set('message')} />
        <button
          onClick={submit}
          disabled={loading}
          className="w-full py-3.5 bg-primary text-primary-foreground font-semibold rounded-2xl disabled:opacity-70"
        >
          {loading ? 'Sending…' : 'Request Enterprise Consultation'}
        </button>
      </div>
    </div>
  );
}
