"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

export default function SignIn() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      toast.success("Magic link sent!", { description: `Check ${email} for secure access to your dashboard and optimizer history.` });
    }, 850);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f172a] pt-16 px-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <Link href="/" className="inline-flex items-center gap-2 text-3xl font-semibold tracking-tighter">
            Palletizer
          </Link>
          <p className="text-white/60 mt-2">Sign in to access your plans, team workspace, and enterprise features.</p>
        </div>

        <div className="glass p-9 rounded-3xl border border-white/10">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="text-xs tracking-widest text-white/60 block mb-1.5">WORK EMAIL</label>
              <input 
                type="email" 
                required 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com" 
                className="w-full bg-black/40 border border-white/20 focus:border-primary rounded-2xl px-5 py-3.5 text-lg placeholder:text-white/40" 
              />
            </div>
            
            <button 
              type="submit" 
              disabled={loading}
              className="w-full py-4 bg-primary text-primary-foreground font-semibold rounded-2xl text-lg disabled:opacity-70 flex items-center justify-center gap-2 active:scale-[0.985] transition"
            >
              {loading ? "Sending secure link..." : "Send Magic Link →"}
            </button>
          </form>

          <div className="my-6 text-center text-xs text-white/50">or</div>

          <div className="space-y-3">
            <button className="w-full py-3.5 border border-white/20 hover:bg-white/5 rounded-2xl flex items-center justify-center gap-3 text-sm font-medium">
              Continue with Google
            </button>
            <button className="w-full py-3.5 border border-white/20 hover:bg-white/5 rounded-2xl flex items-center justify-center gap-3 text-sm font-medium">
              Continue with GitHub
            </button>
          </div>
        </div>

        <p className="text-center text-xs text-white/50 mt-8">
          By signing in you agree to our Terms and Privacy Policy.<br />
          Enterprise SSO &amp; SAML available.
        </p>
      </div>
    </div>
  );
}
