"use client";

import React, { useState } from 'react';

interface PalletPlan {
  metrics: {
    volume_density: number;
    density_uplift_pct: number;
    est_build_time_min: number;
    num_boxes: number;
  };
}

// Every assumption is a visible, editable input. The only plan-derived
// numbers are density uplift and estimated build time — both computed by
// the optimizer from geometry. Nothing here is a hidden coefficient.
const FIELDS: { key: string; label: string; hint: string }[] = [
  { key: 'palletsPerDay', label: 'Pallets / day', hint: 'your throughput' },
  { key: 'workDays', label: 'Work days / yr', hint: 'operating calendar' },
  { key: 'laborCostPerHr', label: 'Labor $ / hr', hint: 'fully loaded' },
  { key: 'laborMinManual', label: 'Manual min / pallet', hint: 'your current build time' },
  { key: 'freightPerPallet', label: 'Freight $ / pallet', hint: 'average lane cost' },
  { key: 'damageRate', label: 'Damage rate %', hint: 'of pallet value' },
  { key: 'palletValue', label: 'Pallet value $', hint: 'avg goods value' },
  { key: 'damageReduction', label: 'Damage cut % (assumption)', hint: 'from stability-validated loads' },
  { key: 'systemCost', label: 'System cost $', hint: 'edit to your quote' },
];

function fmtMoney(n: number): string {
  const sign = n < 0 ? '−' : '';
  return `${sign}$${Math.round(Math.abs(n)).toLocaleString('en-US')}`;
}

export default function ROICalculator({ plan }: { plan: PalletPlan }) {
  const [inputs, setInputs] = useState<Record<string, number>>({
    palletsPerDay: 85,
    workDays: 255,
    laborCostPerHr: 31,
    laborMinManual: 24,
    freightPerPallet: 95,
    damageRate: 2.4,
    palletValue: 480,
    damageReduction: 25,
    systemCost: 165000,
  });

  const setField = (key: string, raw: string) => {
    // accept "2,4" as well as "2.4" — comma-decimal locales
    const v = parseFloat(raw.replace(',', '.'));
    setInputs((prev) => ({ ...prev, [key]: Number.isFinite(v) ? v : 0 }));
  };

  const densityUplift = plan.metrics.density_uplift_pct / 100;
  const timeSavingsMin = Math.max(0, inputs.laborMinManual - plan.metrics.est_build_time_min);
  const annualPallets = inputs.palletsPerDay * inputs.workDays;

  // Fewer pallets shipped for the same volume: uplift u ⇒ pallets shrink by u/(1+u).
  const palletsSavedFrac = densityUplift > 0 ? densityUplift / (1 + densityUplift) : 0;

  const laborSavings = (timeSavingsMin / 60) * inputs.laborCostPerHr * annualPallets;
  const freightSavings = palletsSavedFrac * inputs.freightPerPallet * annualPallets;
  const damageSavings = (inputs.damageRate / 100) * (inputs.damageReduction / 100) * annualPallets * inputs.palletValue;

  const lines = [
    { label: 'Labor', value: laborSavings, note: `${timeSavingsMin.toFixed(1)} min saved/pallet × ${annualPallets.toLocaleString('en-US')} pallets` },
    { label: 'Freight', value: freightSavings, note: densityUplift > 0 ? `${(palletsSavedFrac * 100).toFixed(1)}% fewer pallets from +${plan.metrics.density_uplift_pct}% density` : 'no density uplift on this plan' },
    { label: 'Damage', value: damageSavings, note: `${inputs.damageRate}% rate × ${inputs.damageReduction}% reduction (your assumption)` },
  ];
  const total = lines.reduce((s, l) => s + l.value, 0);
  const paybackMonths = total > 0 ? inputs.systemCost / (total / 12) : null;
  const roiYear1 = inputs.systemCost > 0 ? ((total - inputs.systemCost) / inputs.systemCost) * 100 : 0;
  const positive = total > 0;

  return (
    <div className="glass p-7 rounded-3xl border border-white/10">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <div className="font-semibold text-lg">ROI Model — every assumption editable</div>
          <div className="text-xs text-white/60">Plan-derived: density uplift + build time. Everything else is yours to set.</div>
        </div>
        <div className="text-right">
          <div className={`text-3xl font-mono tracking-tighter ${positive ? 'text-emerald-400' : 'text-amber-400'}`}>
            {positive ? `+${fmtMoney(total)}` : fmtMoney(total)}
          </div>
          <div className="text-[10px] text-white/60 -mt-1">MODELED ANNUAL SAVINGS</div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5 text-sm">
        {FIELDS.map(({ key, label, hint }) => (
          <div key={key}>
            <label className="block text-xs text-white/60 mb-1 tracking-wider">{label}</label>
            <input
              type="text"
              inputMode="decimal"
              defaultValue={inputs[key]}
              onChange={(e) => setField(key, e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 focus:border-primary/60 focus:outline-none font-mono"
            />
            <div className="text-[10px] text-white/35 mt-0.5">{hint}</div>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-3 gap-3 mb-5">
        {lines.map((l) => (
          <div key={l.label} className="p-4 rounded-2xl bg-white/[0.03] border border-white/10">
            <div className="text-[10px] tracking-[2px] text-white/50">{l.label.toUpperCase()}</div>
            <div className={`text-xl font-mono ${l.value > 0 ? 'text-emerald-400' : 'text-white/50'}`}>{fmtMoney(l.value)}</div>
            <div className="text-[10px] text-white/40 mt-0.5">{l.note}</div>
          </div>
        ))}
      </div>

      {positive ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 text-center">
            <div className="text-2xl font-mono">{paybackMonths !== null ? `${paybackMonths.toFixed(1)} mo` : '—'}</div>
            <div className="text-[10px] text-white/50 tracking-wider">PAYBACK on your system cost</div>
          </div>
          <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 text-center">
            <div className={`text-2xl font-mono ${roiYear1 >= 0 ? 'text-emerald-400' : 'text-white/70'}`}>{roiYear1 >= 0 ? '+' : ''}{roiYear1.toFixed(0)}%</div>
            <div className="text-[10px] text-white/50 tracking-wider">YEAR 1 ROI</div>
          </div>
        </div>
      ) : (
        <div className="p-4 rounded-2xl border border-amber-500/40 bg-amber-950/20 text-sm text-amber-200/90">
          At these inputs the model shows no net savings — that's the honest output, not a bug. Small or
          low-density orders don't benefit; upload a realistic order profile or adjust the assumptions above.
        </div>
      )}

      <div className="text-[10px] text-white/35 mt-4">
        Model: labor = time saved × rate × volume · freight = pallets eliminated by density uplift ·
        damage = your rate × your assumed reduction × your pallet value. No hidden coefficients.
      </div>
    </div>
  );
}
