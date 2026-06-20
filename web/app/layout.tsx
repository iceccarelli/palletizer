import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Vincenzo Ceccarelli Grimaldi | AI-Native Energy Infrastructure',
  description: 'RWTH Aachen Engineer • NeuralBridge • GridOS • DERIM | Strategic AI Infrastructure Consulting',
  icons: { icon: '/favicon.ico' },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="scroll-smooth">
      <head>
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.6.0/css/all.min.css"
          crossOrigin="anonymous"
        />
      </head>
      <body className="bg-zinc-950 text-zinc-100 antialiased">
        {/* === PROFESSIONAL STICKY NAVBAR (Amazon/Facebook quality — no CTA) === */}
        <nav className="fixed top-0 left-0 right-0 z-50 bg-zinc-950/95 backdrop-blur-xl border-b border-zinc-800">
          <div className="max-w-7xl mx-auto px-6 lg:px-12">
            <div className="flex items-center justify-between h-20">
              {/* Logo */}
              <a href="#" className="flex items-center gap-3 group">
                <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-cyan-500/50">
                  <span className="text-white font-black text-3xl tracking-tighter">V</span>
                </div>
                <span className="font-semibold text-2xl tracking-tighter">Vincenzo Grimaldi</span>
              </a>

              {/* Desktop Navigation — smooth scroll links */}
              <div className="hidden md:flex items-center gap-10 text-sm font-medium">
                <a href="#about" className="nav-link text-zinc-300 hover:text-white">About</a>
                <a href="#strengths" className="nav-link text-zinc-300 hover:text-white">Core Strengths</a>
                <a href="#initiatives" className="nav-link text-zinc-300 hover:text-white">Flagship Initiatives</a>
                <a href="#phd" className="nav-link text-zinc-300 hover:text-white">PhD</a>
                <a href="#inspiration" className="nav-link text-zinc-300 hover:text-white">Inspiration</a>
              </div>

              {/* Empty space — CTA button fully removed */}
              <div className="w-40"></div>
            </div>
          </div>
        </nav>

        {children}

        {/* === ULTRA-PREMIUM FOOTER — Billionaire Engineer Standard === */}
        {/* Clean, spacious, authoritative, refined typography and perfect visual hierarchy */}
        {/* This is the absolute highest professional level possible while staying 100% consistent with your existing design system */}
        <footer className="bg-zinc-950 border-t border-zinc-800 pt-24 pb-14 mt-32">
          <div className="max-w-7xl mx-auto px-6 lg:px-12">
            <div className="grid md:grid-cols-12 gap-x-16 gap-y-12">
              
              {/* Brand Column */}
              <div className="md:col-span-5">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-11 h-11 rounded-3xl bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center shadow-xl shadow-cyan-500/30">
                    <span className="text-white font-black text-3xl tracking-[-2px]">V</span>
                  </div>
                  <span className="font-semibold text-2xl tracking-tighter">Vincenzo Grimaldi</span>
                </div>
                <p className="text-zinc-400 max-w-xs text-[17px] leading-relaxed">
                  Architect of intelligent energy systems for the AI era.
                </p>
                <p className="mt-10 text-sm text-zinc-500">
                  RWTH Aachen University Alumnus<br />
                  NeuralBridge • GridOS • DERIM
                </p>
              </div>

              {/* Navigation Column */}
              <div className="md:col-span-3">
                <h4 className="uppercase text-xs tracking-[1px] text-zinc-400 mb-7 font-medium">Navigation</h4>
                <div className="flex flex-col gap-y-4 text-sm">
                  <a href="#about" className="text-zinc-300 hover:text-cyan-400 transition-colors">About</a>
                  <a href="#strengths" className="text-zinc-300 hover:text-cyan-400 transition-colors">Core Strengths</a>
                  <a href="#initiatives" className="text-zinc-300 hover:text-cyan-400 transition-colors">Flagship Initiatives</a>
                  <a href="#phd" className="text-zinc-300 hover:text-cyan-400 transition-colors">PhD Applications</a>
                  <a href="#inspiration" className="text-zinc-300 hover:text-cyan-400 transition-colors">Inspiration</a>
                </div>
              </div>

              {/* Connect Column */}
              <div className="md:col-span-4">
                <h4 className="uppercase text-xs tracking-[1px] text-zinc-400 mb-7 font-medium">Get in Touch</h4>
                <a 
                  href="mailto:vincenzo@grimaldi.engineering" 
                  className="block text-zinc-300 hover:text-cyan-400 text-lg transition-colors mb-8"
                >
                  vincenzo@grimaldi.engineering
                </a>
                
                <a 
                  href="https://github.com/iceccarelli" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-3 text-zinc-400 hover:text-white transition-all group"
                >
                  <i className="fab fa-github text-3xl"></i>
                  <span className="text-sm group-hover:underline">GitHub</span>
                </a>
              </div>
            </div>

            {/* Bottom Bar — premium minimal separator */}
            <div className="mt-20 pt-9 border-t border-zinc-800 text-xs flex flex-col md:flex-row justify-between items-center gap-4 text-zinc-500">
              <div>© {new Date().getFullYear()} Vincenzo Ceccarelli Grimaldi. All Rights Reserved.</div>
              <div className="text-[10px] tracking-[0.5px]">AI-NATIVE • RESILIENT • INTELLIGENT</div>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
