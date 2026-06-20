import ROICalculator from "@/components/ROICalculator";
const referencePlan = { metrics: { volume_density: 0.82, density_uplift_pct: 18.5, est_build_time_min: 6.5, num_boxes: 42 } };
export const metadata = { title: "ROI Calculator | Palletizer", description: "Quantify labor, freight, and damage savings from intelligent palletizing." };
export default function ROICalculatorPage() {
  return (
    <div className="min-h-screen bg-[#0f172a] pt-28 pb-20 px-6">
      <div className="max-w-3xl mx-auto text-center mb-12">
        <div className="text-accent tracking-[3px] text-sm mb-2">PROVE THE NUMBERS</div>
        <h1 className="text-5xl md:text-6xl font-semibold tracking-tighter">ROI Calculator</h1>
        <p className="mt-4 text-lg text-white/70 max-w-xl mx-auto">Adjust your throughput and cost assumptions to see annual savings and payback.</p>
      </div>
      <div className="max-w-2xl mx-auto"><ROICalculator plan={referencePlan} /></div>
    </div>
  );
}
