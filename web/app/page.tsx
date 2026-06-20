'use client';
import Image from 'next/image';

export default function Home() {
  return (
    <div className="pt-20">
      {/* === UPDATED PROFESSIONAL HERO SECTION === */}
      <section className="bg-zinc-950 py-20">
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <div className="grid lg:grid-cols-12 gap-12 items-center">
           
            {/* LEFT: Text + Amazon-style buttons */}
            <div className="lg:col-span-7 text-white">
              <h1 className="text-6xl lg:text-7xl font-bold tracking-tighter leading-none mb-4">
                Vincenzo Ceccarelli Grimaldi
              </h1>
              <p className="text-3xl text-blue-400 font-medium mb-6">
                Power Systems • AI • Energy Transition
              </p>
              <p className="max-w-lg text-xl text-zinc-200">
                Personal aim is to build the next generation of resilient, end-to-end intelligent energy infrastructure.
              </p>
            </div>

            {/* RIGHT: Your new professional headshot (fixed) */}
            <div className="lg:col-span-5 flex justify-center lg:justify-end">
              <Image
                src="https://raw.githubusercontent.com/iceccarelli/vincenzo-grimaldi-portfolio/main/Vincenzo_Grimaldi_footer_picture_website.jpg"
                alt="Vincenzo Ceccarelli Grimaldi"
                width={520}
                height={520}
                className="rounded-3xl shadow-2xl w-full max-w-[420px] lg:max-w-none object-cover border-8 border-zinc-800"
                priority
              />
            </div>
          </div>
        </div>
      </section>

      <main className="max-w-7xl mx-auto px-6 py-20 lg:px-12">
        {/* === EVERYTHING BELOW THIS LINE IS 100% UNCHANGED === */}
        {/* ABOUT */}
        <section id="about" className="max-w-4xl mx-auto mb-32 scroll-mt-24">
          <h2 className="text-4xl font-bold mb-10 border-b border-blue-600 pb-3 inline-block">About Me</h2>
          <p className="text-lg leading-relaxed mb-6">
            At the intersection of electrical power engineering, quantitative intelligence, and knowledge engineering, I design resilient, adaptive cyber-physical systems that power the energy transition.
          </p>
          <p className="text-lg leading-relaxed">
            RWTH Aachen trained (Business Administration &amp; Engineering — Electrical Power Engineering), I bridge theory and production-grade impact through <strong>NeuralBridge</strong>, <strong>GridOS</strong>, and <strong>DERIM</strong>.
          </p>
        </section>

        {/* CORE STRENGTHS */}
        <section id="strengths" className="mb-32 scroll-mt-24">
          <h2 className="text-4xl font-bold mb-12">Core Strengths</h2>
          <div className="grid md:grid-cols-2 gap-8">
            {[
              {
                icon: 'code',
                title: 'Programming & Tools',
                text: 'Python (Pandas, NumPy, PyTorch, JAX), React.js & React Native, SQL/NoSQL, Docker, Kubernetes, CI/CD',
              },
              {
                icon: 'brain',
                title: 'Analytical Methods',
                text: 'Physics-Informed Neural Networks, Multi-Agent RL, Knowledge Graphs & Ontologies, Time-Series Forecasting, Stochastic Optimization',
              },
              {
                icon: 'bolt',
                title: 'Domain Expertise',
                text: 'Power Grid Stability & Cybersecurity, DER + V2G Integration, Transactive Energy Markets, IEC 61850 / CIM',
              },
              {
                icon: 'leaf',
                title: 'Strategic Skills',
                text: 'Life Cycle Assessment, Regulatory Intelligence, Blockchain & Energy DAOs, High-Stakes Project Leadership',
              },
            ].map((s, i) => (
              <div
                key={i}
                className="card-hover bg-zinc-900/70 backdrop-blur-sm p-8 rounded-3xl border border-zinc-800 hover:border-blue-500"
              >
                <div className="flex items-center gap-4 mb-5">
                  <i className={`fas fa-${s.icon} text-3xl text-blue-500`} />
                  <h3 className="text-2xl font-semibold">{s.title}</h3>
                </div>
                <p className="text-zinc-300">{s.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* FLAGSHIP INITIATIVES */}
        <section id="initiatives" className="mb-32 scroll-mt-24">
          <h2 className="text-4xl font-bold mb-12">Flagship Initiatives</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                title: 'NeuralBridge',
                desc: 'Secure, semantically-aware middleware for agentic AI across any enterprise protocol or legacy system.',
                link: 'https://github.com/iceccarelli/neuralbridge',
              },
              {
                title: 'GridOS',
                desc: 'Next-gen digital twin fusing physics simulation, RL agents, and real-time optimization for autonomous grids.',
                link: 'https://github.com/iceccarelli/GridOS',
              },
              {
                title: 'DERIM',
                desc: 'Blockchain-native decentralized energy resource platform for P2P trading and virtual power plants.',
                link: 'https://github.com/iceccarelli/derim-middleware',
              },
            ].map((p, i) => (
              <a
                key={i}
                href={p.link}
                target="_blank"
                rel="noopener noreferrer"
                className="card-hover block bg-zinc-900/70 backdrop-blur-sm p-8 rounded-3xl border border-zinc-800 hover:border-blue-500 group"
              >
                <h3 className="text-3xl font-bold text-blue-400 mb-5 group-hover:text-cyan-400 transition-colors">
                  {p.title}
                </h3>
                <p className="text-zinc-300 leading-relaxed">{p.desc}</p>
                <div className="mt-6 text-cyan-400 text-sm flex items-center gap-2 group-hover:gap-3 transition-all">
                  View on GitHub <i className="fas fa-arrow-right text-xs" />
                </div>
              </a>
            ))}
          </div>
        </section>

        {/* PHD APPLICATIONS SECTION – completely untouched */}
        <section
          id="phd"
          className="mb-32 scroll-mt-24 bg-zinc-900/50 rounded-3xl p-16 border border-zinc-800"
        >
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">PhD Applications – ERC Synergy Grant SAFEr Grid</h2>
            <p className="text-xl text-zinc-400 max-w-3xl mx-auto">
              Transparent &amp; Open Application Process at RWTH Aachen University
            </p>
            <p className="text-sm text-cyan-400 mt-3 tracking-widest">
              TWO INTERDISCIPLINARY APPLICATIONS
            </p>
          </div>
          <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-16">
            {/* TIM APPLICATION */}
            <div className="group">
              <a
                href="https://www.jobs.rwth-aachen.de/index.php?ac=jobad&id=11302"
                target="_blank"
                rel="noopener noreferrer"
                className="group block text-center transition-all duration-700 hover:scale-[1.04] hover:-translate-y-6 hover:shadow-[0_40px_80px_-20px_rgb(59,130,246)]"
              >
                <h2 className="text-2xl font-bold text-white mb-3">TIME Application Job-ID: V000010767</h2>
                <p className="text-blue-400 text-sm mb-10">
                  Lehrstuhl für Betriebswirtschaftslehre, insbesondere
                  <br />
                  Technologie- und Innovationsmanagement (TIME Research Area)
                </p>
                <div className="mx-auto mb-8 relative w-[172px] h-[172px]">
                  <div className="absolute inset-0 rounded-3xl border-8 border-zinc-900 group-hover:border-blue-950 transition-colors" />
                  <div className="absolute inset-[10px] bg-zinc-950 rounded-3xl flex items-center justify-center border border-blue-500/40 group-hover:border-blue-400 transition-all shadow-inner">
                    <i className="fas fa-file-contract text-[138px] text-blue-400" />
                  </div>
                </div>
                <i className="fas fa-arrow-down text-7xl text-blue-500/70 group-hover:text-blue-400 transition-colors" />
              </a>
              <div className="mt-28 border-4 border-zinc-700/50 rounded-3xl p-20 group-hover:border-blue-400 transition-all duration-700">
                {/* Motivation Letter */}
                <a
                  href="https://raw.githubusercontent.com/iceccarelli/vincenzo-grimaldi-portfolio/main/Vincenzo_Ceccarelli_Grimaldi_Motivation_Letter_TIM_SAFEr_Grid.pdf"
                  target="_blank"
                  className="group block p-8 bg-zinc-900 rounded-3xl border border-zinc-700 hover:border-blue-400 transition-all duration-700 hover:scale-[1.04] hover:-translate-y-6 hover:shadow-[0_40px_80px_-20px_rgb(59,130,246)] flex items-center justify-between mb-10"
                >
                  <div className="flex items-center gap-6">
                    <i className="fas fa-file-lines text-5xl text-amber-400" />
                    <div>
                      <div className="font-semibold text-lg">Motivation Letter</div>
                      <div className="text-sm text-zinc-500">2 pages • 21 March 2026</div>
                    </div>
                  </div>
                  <i className="fas fa-download text-3xl text-blue-400 group-hover:-translate-y-1 transition-transform" />
                </a>
                {/* CV */}
                <a
                  href="https://raw.githubusercontent.com/iceccarelli/vincenzo-grimaldi-portfolio/main/Vincenzo_Ceccarelli_Grimaldi_CV_TIM_SAFEr_Grid.pdf"
                  target="_blank"
                  className="group block p-8 bg-zinc-900 rounded-3xl border border-zinc-700 hover:border-blue-400 transition-all duration-700 hover:scale-[1.04] hover:-translate-y-6 hover:shadow-[0_40px_80px_-20px_rgb(59,130,246)] flex items-center justify-between"
                >
                  <div className="flex items-center gap-6">
                    <i className="fas fa-file-pdf text-5xl text-red-500" />
                    <div>
                      <div className="font-semibold text-lg">Curriculum Vitae</div>
                      <div className="text-sm text-zinc-500">4 pages • March 2026</div>
                    </div>
                  </div>
                  <i className="fas fa-download text-3xl text-blue-400 group-hover:-translate-y-1 transition-transform" />
                </a>
              </div>
            </div>

            {/* ACS APPLICATION */}
            <div className="group">
              <a
                href="https://www.jobs.rwth-aachen.de/index.php?ac=jobad&id=11383&language=2"
                target="_blank"
                rel="noopener noreferrer"
                className="group block text-center transition-all duration-700 hover:scale-[1.04] hover:-translate-y-6 hover:shadow-[0_40px_80px_-20px_rgb(248,113,113)]"
              >
                <h2 className="text-2xl font-bold text-white mb-3">ACS Application Job-ID: V000010837</h2>
                <p className="text-red-400 text-sm mb-10">
                  Institute for Automation of Complex Power Systems (ACS)
                  <br />
                  E.ON Energy Research Center
                </p>
                <div className="mx-auto mb-8 relative w-[172px] h-[172px]">
                  <div className="absolute inset-0 rounded-3xl border-8 border-zinc-900 group-hover:border-red-950 transition-colors" />
                  <div className="absolute inset-[10px] bg-zinc-950 rounded-3xl flex items-center justify-center border border-red-500/40 group-hover:border-red-400 transition-all shadow-inner">
                    <i className="fas fa-file-contract text-[138px] text-red-400" />
                  </div>
                </div>
                <i className="fas fa-arrow-down text-7xl text-red-500/70 group-hover:text-red-400 transition-colors" />
              </a>
              <div className="mt-28 border-4 border-zinc-700/50 rounded-3xl p-20 group-hover:border-red-400 transition-all duration-700">
                {/* Motivation Letter */}
                <a
                  href="https://raw.githubusercontent.com/iceccarelli/vincenzo-grimaldi-portfolio/main/Vincenzo_Ceccarelli_Grimaldi_Motivation_Letter_ACS_SAFEr_Grid.pdf"
                  target="_blank"
                  className="group block p-8 bg-zinc-900 rounded-3xl border border-zinc-700 hover:border-red-400 transition-all duration-700 hover:scale-[1.04] hover:-translate-y-6 hover:shadow-[0_40px_80px_-20px_rgb(248,113,113)] flex items-center justify-between mb-10"
                >
                  <div className="flex items-center gap-6">
                    <i className="fas fa-file-lines text-5xl text-amber-400" />
                    <div>
                      <div className="font-semibold text-lg">Motivation Letter</div>
                      <div className="text-sm text-zinc-500">2 pages • 22 March 2026</div>
                    </div>
                  </div>
                  <i className="fas fa-download text-3xl text-red-400 group-hover:-translate-y-1 transition-transform" />
                </a>
                {/* CV */}
                <a
                  href="https://raw.githubusercontent.com/iceccarelli/vincenzo-grimaldi-portfolio/main/Vincenzo_Ceccarelli_Grimaldi_CV_ACS_SAFEr_Grid.pdf"
                  target="_blank"
                  className="group block p-8 bg-zinc-900 rounded-3xl border border-zinc-700 hover:border-red-400 transition-all duration-700 hover:scale-[1.04] hover:-translate-y-6 hover:shadow-[0_40px_80px_-20px_rgb(248,113,113)] flex items-center justify-between"
                >
                  <div className="flex items-center gap-6">
                    <i className="fas fa-file-pdf text-5xl text-red-500" />
                    <div>
                      <div className="font-semibold text-lg">Curriculum Vitae</div>
                      <div className="text-sm text-zinc-500">4 pages • March 2026</div>
                    </div>
                  </div>
                  <i className="fas fa-download text-3xl text-red-400 group-hover:-translate-y-1 transition-transform" />
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* INSPIRATION SECTION */}
        <section
          id="inspiration"
          className="bg-gradient-to-br from-blue-950 via-zinc-950 to-zinc-950 border border-blue-800/40 rounded-3xl p-16 text-center scroll-mt-24"
        >
          <h2 className="text-5xl font-extrabold mb-8 bg-clip-text text-transparent bg-gradient-to-r from-blue-300 to-cyan-300">
            Building AI-Native Energy Infrastructure
          </h2>
          <p className="text-2xl text-zinc-300 mb-10 max-w-3xl mx-auto">
            Strategic consulting &amp; implementation for utilities, operators, and innovators ready to dominate the next energy era.
          </p>
          <div className="max-w-5xl mx-auto">
            <p className="uppercase tracking-[3px] text-blue-400 text-sm mb-6">
              Sources of Inspiration &amp; Intelligence
            </p>
            <div className="grid md:grid-cols-3 gap-6">
              <a
                href="https://about.bnef.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="card-hover group bg-zinc-900/80 p-8 rounded-3xl border border-zinc-700 hover:border-blue-500"
              >
                <h4 className="font-bold text-2xl mb-3 text-white">BloombergNEF</h4>
                <p className="text-zinc-400 text-sm leading-relaxed mb-6">
                  The world’s leading source for energy market intelligence, AI load forecasts, and infrastructure investment trends.
                </p>
                <span className="text-cyan-400 text-sm group-hover:underline">bnef.com →</span>
              </a>
              <a
                href="https://www.iea.org/"
                target="_blank"
                rel="noopener noreferrer"
                className="card-hover group bg-zinc-900/80 p-8 rounded-3xl border border-zinc-700 hover:border-blue-500"
              >
                <h4 className="font-bold text-2xl mb-3 text-white">International Energy Agency</h4>
                <p className="text-zinc-400 text-sm leading-relaxed mb-6">
                  Authoritative global analysis on AI for energy optimisation, grid modernization, and the clean energy transition.
                </p>
                <span className="text-cyan-400 text-sm group-hover:underline">iea.org →</span>
              </a>
              <a
                href="https://energy.mit.edu/"
                target="_blank"
                rel="noopener noreferrer"
                className="card-hover group bg-zinc-900/80 p-8 rounded-3xl border border-zinc-700 hover:border-blue-500"
              >
                <h4 className="font-bold text-2xl mb-3 text-white">MIT Energy Initiative</h4>
                <p className="text-zinc-400 text-sm leading-relaxed mb-6">
                  Pioneering research in digital twins, physics-informed AI, and autonomous energy systems — core to GridOS thinking.
                </p>
                <span className="text-cyan-400 text-sm group-hover:underline">energy.mit.edu →</span>
              </a>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
