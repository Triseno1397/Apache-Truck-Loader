import { Package } from "lucide-react";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-8 h-8 rounded bg-[#00d4ff] flex items-center justify-center">
          <Package size={16} className="text-[#0a0b0d]" />
        </div>
        <div>
          <div className="font-semibold text-sm tracking-tight">
            Apache Truck Loader
          </div>
          <div className="text-[10px] text-[#4a5058] tracking-[0.2em] uppercase">
            Scaffold &middot; v0.1
          </div>
        </div>
      </div>
      <div className="mono text-[11px] text-[#8a9199] tracking-[0.2em] uppercase">
        Project initialized
      </div>
    </main>
  );
}
