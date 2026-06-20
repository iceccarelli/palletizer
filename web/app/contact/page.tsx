import { ArrowRight } from "lucide-react";
export const metadata = { title: "Contact | Palletizer" };
export default function Contact() {
  return (
    <div className="min-h-screen bg-[#0f172a] pt-28 pb-20 px-6">
      <div className="max-w-xl mx-auto text-center">
        <div className="text-accent tracking-[3px] text-sm mb-2">LET&apos;S TALK</div>
        <h1 className="text-4xl md:text-6xl font-semibold tracking-tighter mb-4">Contact</h1>
        <p className="text-lg text-white/70 mb-10">
          Pilots, integrations, careers, or support. The fastest channel today is GitHub; email works too.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <a href="https://github.com/iceccarelli/palletizer/issues" target="_blank" rel="noopener noreferrer"
             className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-2xl transition">
            Open a GitHub Issue <ArrowRight className="w-4 h-4" />
          </a>
          <a href="mailto:hello@example.com"
             className="inline-flex items-center justify-center gap-2 px-8 py-4 border border-white/30 hover:bg-white/5 rounded-2xl font-semibold transition">
            Email Us
          </a>
        </div>
        <p className="text-xs text-white/40 mt-6">Replace the mailto address in app/contact/page.tsx with your real inbox.</p>
      </div>
    </div>
  );
}
