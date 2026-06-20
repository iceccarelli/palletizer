export const metadata = { title: "Privacy | Palletizer" };
export default function Privacy() {
  return (
    <div className="min-h-screen bg-[#0f172a] pt-28 pb-20 px-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-4xl md:text-5xl font-semibold tracking-tighter mb-6">Privacy</h1>
        <div className="space-y-4 text-white/70 leading-relaxed">
          <p>This is a working placeholder pending counsel review. It is not yet a binding privacy policy.</p>
          <p>SKU data uploaded to the live optimizer is processed to generate pallet plans and is not sold or shared with third parties. The open-core optimizer can be run fully locally for zero data egress.</p>
          <p>For data questions, contact us via the <a href="/contact" className="text-primary underline">contact page</a>.</p>
        </div>
      </div>
    </div>
  );
}
