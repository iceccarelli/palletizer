"use client";

// Floating site assistant (AWS "Amazon Q" pattern, our brain).
// Honest by construction: the panel displays WHICH engine answered
// (Claude vs rule fallback), and the API's system prompt forbids invention.

import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquare, X, Send, Sparkles } from "lucide-react";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS = [
  "What does the optimizer actually do?",
  "Show me the API",
  "How do the six missions work?",
  "What are the known limitations?",
];

/** Minimal safe renderer: plain text + [label](href) links only. */
function RichText({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  const re = /\[([^\]]+)\]\((\/[^\s)]+|https?:\/\/[^\s)]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const href = m[2];
    parts.push(
      <a
        key={i++}
        href={href}
        target={href.startsWith("http") ? "_blank" : undefined}
        rel="noreferrer"
        className="text-primary underline underline-offset-2 hover:opacity-80"
      >
        {m[1]}
      </a>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

export default function AssistantWidget() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [engine, setEngine] = useState<"claude" | "rules" | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, busy]);

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    const next: Msg[] = [...msgs, { role: "user", content: trimmed }];
    setMsgs(next);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.slice(-10) }),
      });
      const data = await res.json();
      if (res.ok && data.reply) {
        setMsgs([...next, { role: "assistant", content: data.reply }]);
        setEngine(data.engine);
      } else {
        setMsgs([...next, { role: "assistant", content: "Something went wrong on my side — the whole product is open source at https://github.com/iceccarelli/palletizer, or reach a human at /contact." }]);
      }
    } catch {
      setMsgs([...next, { role: "assistant", content: "Network hiccup — try again, or reach a human via [contact](/contact)." }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {/* Launcher */}
      <AnimatePresence>
        {!open && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={() => setOpen(true)}
            aria-label="Open assistant"
            className="fixed bottom-5 right-5 z-[60] w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-2xl shadow-primary/30 flex items-center justify-center hover:scale-105 transition-transform"
          >
            {/* Pulsating attention rings */}
            <span className="absolute inset-0 rounded-full bg-primary/60 animate-ping" />
            <span className="absolute -inset-1.5 rounded-full border border-primary/30 animate-pulse" />
            <MessageSquare className="w-6 h-6 relative" />
            <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-400 border-2 border-[#0f172a] relative z-10" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.97 }}
            transition={{ duration: 0.18 }}
            className="fixed bottom-5 right-5 z-[60] w-[380px] max-w-[calc(100vw-2rem)] h-[560px] max-h-[calc(100vh-6rem)] rounded-3xl border border-white/10 bg-[#0b1222]/97 backdrop-blur-xl shadow-2xl shadow-black/60 flex flex-col overflow-hidden"
            role="dialog"
            aria-label="Palletizer assistant"
          >
            {/* Hero header — Ask-AWS anatomy: title + badge, subtitle, input inside the gradient */}
            <div className="px-5 pt-4 pb-5 bg-gradient-to-br from-primary via-blue-600 to-indigo-700 relative">
              <button onClick={() => setOpen(false)} aria-label="Close" className="absolute top-3 right-3 p-1.5 text-white/70 hover:text-white transition">
                <X className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-2 mb-1.5">
                <div className="text-xl font-bold tracking-tight text-white">Ask Palletizer</div>
                <span className="px-2 py-0.5 rounded-full bg-white/15 border border-white/25 text-[10px] font-medium text-white flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  {engine === "rules" ? "rules mode" : "open source"}
                </span>
              </div>
              <p className="text-xs text-white/85 mb-3 leading-snug">
                {engine === "rules"
                  ? "Rule-based answers (AI path not configured on this deployment)."
                  : "Guidance on the engine, the six demos, and the API — grounded in the open-source repo. If it doesn't know, it says so."}
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  send(input);
                }}
                className="flex items-center bg-white rounded-xl overflow-hidden shadow-lg"
              >
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask a question"
                  maxLength={2000}
                  className="flex-1 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none bg-transparent"
                />
                <button
                  type="submit"
                  disabled={busy || !input.trim()}
                  aria-label="Send"
                  className="m-1.5 w-8 h-8 rounded-full bg-slate-800 text-white flex items-center justify-center disabled:opacity-30 transition"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </form>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 text-sm">
              {msgs.length === 0 && (
                <div className="space-y-3">
                  <div>
                    <div className="font-semibold text-white/90">Want help getting started?</div>
                    <div className="text-xs text-white/55">Tell us a little bit about what you&apos;re looking for.</div>
                  </div>
                  <div className="flex flex-col gap-2">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        onClick={() => send(s)}
                        className="w-full text-left px-4 py-2.5 text-sm rounded-xl border border-primary/40 bg-primary/5 text-white/85 hover:bg-primary/15 hover:border-primary/70 transition"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {msgs.map((m, i) => (
                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl leading-relaxed ${
                      m.role === "user" ? "bg-primary text-primary-foreground rounded-br-md" : "bg-white/5 border border-white/10 rounded-bl-md"
                    }`}
                  >
                    <RichText text={m.content} />
                  </div>
                </div>
              ))}
              {busy && (
                <div className="flex justify-start">
                  <div className="px-3.5 py-2.5 rounded-2xl bg-white/5 border border-white/10 flex gap-1.5">
                    {[0, 1, 2].map((d) => (
                      <motion.span
                        key={d}
                        className="w-1.5 h-1.5 rounded-full bg-white/60"
                        animate={{ opacity: [0.3, 1, 0.3] }}
                        transition={{ duration: 1, repeat: Infinity, delay: d * 0.2 }}
                      />
                    ))}
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Disclaimer footer — AWS pattern */}
            <div className="px-4 py-2.5 border-t border-white/10 bg-[#080d1a] text-center text-[10px] text-white/40">
              By chatting, you agree to our{" "}
              <a href="/terms" className="text-primary hover:underline">site terms</a>. Answers are grounded in the
              open-source repo{engine === "claude" ? " and generated by Claude" : ""}.
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
