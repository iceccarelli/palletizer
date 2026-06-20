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

export default function ROICalculator({ plan }: { plan: PalletPlan }) {
  const [inputs, setInputs] = useState({
    palletsPerDay: 85,
    workDays: 255,
    laborCostPerHr: 31,
    laborMinManual: 24,
    freightPerPallet: 95,
    damageRate: 2.4,
    palletValue: 480,
  });

  const densityUplift = plan.metrics.density_uplift_pct / 100;
  const timeSavingsMin = Math.max(0, inputs.laborMinManual - plan.metrics.est_build_time_min);

  const annualPallets = inputs.palletsPerDay * inputs.workDays;
  const laborSavings = (timeSavingsMin / 60) * inputs.laborCostPerHr * annualPallets;
  const freightSavings = densityUplift * inputs.freightPerPallet * annualPallets;
  const damageSavings = (inputs.damageRate / 100 * 0.55) * inputs.palletValue * annualPallets;

  const totalAnnualSavings = laborSavings + freightSavings + damageSavings;
  const systemCost = 165000; // Reference enterprise deployment cost
  const paybackMonths = totalAnnualSavings > 0 ? (systemCost / (totalAnnualSavings / 12)) : 999;
  const roiYear1 = ((totalAnnualSavings - systemCost) / systemCost) * 100;

  return (
    <div className="glass p-7 rounded-3xl border border-white/10">
      <div className="flex items-center justify-between mb-5">
        <div>
          <div className="font-semibold text-lg">Instant ROI Projection</div>
          <div className="text-xs text-white/60">Based on your plan metrics + your operations data</div>
        </div>
        <div className="text-right">
          <div className="text-emerald-400 text-3xl font-mono tracking-tighter">+${Math.round(totalAnnualSavings / 1000)}k</div>
          <div className="text-[10px] text-white/60 -mt-1">ANNUAL SAVINGS</div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 text-sm">
        {Object.entries(inputs).map(([key, value]) => (
          <div key={key}>
            <label className="block text-xs text-white/60 mb-1 capitalize tracking-wider">{key.replace(/([A-Z])/g, ' $1')}</label>
            <input 
              type="number" 
              value={value} 
              onChange={(e) => setInputs(prev => ({ ...prev, [key]: parseFloat(e.target.value) || 0 }))}
              className="w-full bg-white/5 border border-white/20 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-primary"
            />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-4 text-center">
        <div className="bg-white/5 rounded-2xl p-4">
          <div className="text-emerald-400 text-2xl font-semibold tracking-tighter">${Math.round(totalAnnualSavings).toLocaleString()}</div>
          <div className="text-xs text-white/60">Total Annual Savings</div>
        </div>
        <div className="bg-white/5 rounded-2xl p-4">
          <div className="text-2xl font-semibold tracking-tighter">{paybackMonths < 60 ? paybackMonths.toFixed(1) : '—'} mo</div>
          <div className="text-xs text-white/60">Payback Period</div>
        </div>
        <div className="bg-white/5 rounded-2xl p-4">
          <div className={`text-2xl font-semibold tracking-tighter ${roiYear1 > 0 ? 'text-emerald-400' : 'text-white/60'}`}>
            {roiYear1 > 0 ? `+${roiYear1.toFixed(0)}%` : '—'}
          </div>
          <div className="text-xs text-white/60">Year 1 ROI</div>
        </div>
      </div>
      <p className="text-[10px] text-center text-white/50 mt-4">Adjust your operational numbers above. Real customer data produces even stronger numbers.</p>
    </div>
  );
}
