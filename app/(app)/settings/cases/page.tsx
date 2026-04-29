import { Globe2, Layers, Package } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  CASE_CATEGORY_LABELS,
  CASE_CATEGORY_ORDER,
  type CaseCategory,
} from "@/lib/vendor-input";
import CaseLibraryClient, {
  type CaseRow,
} from "@/components/case/CaseLibraryClient";

export default async function CaseLibraryPage() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("case_library")
    .select(
      "id, label, depth_in, width_in, height_in, weight_lb, stackable, max_stack, is_global, category",
    )
    .order("label", { ascending: true });

  if (error) {
    return (
      <div className="border border-[#dc2626]/30 bg-[#dc2626]/10 text-[#dc2626] rounded-md p-4 text-sm">
        Could not load case library: {error.message}
      </div>
    );
  }

  const allCases: CaseRow[] = (data ?? []).map((r) => ({
    id: r.id,
    label: r.label,
    depthIn: Number(r.depth_in),
    widthIn: Number(r.width_in),
    heightIn: Number(r.height_in),
    weightLb: Number(r.weight_lb),
    stackable: r.stackable,
    maxStack: r.max_stack,
    isGlobal: r.is_global,
    category: normalizeCategory(r.category),
  }));

  const orgCases = allCases.filter((c) => !c.isGlobal);
  const globalsByCategory = new Map<CaseCategory | "__other__", CaseRow[]>();
  for (const c of allCases) {
    if (!c.isGlobal) continue;
    const key: CaseCategory | "__other__" = c.category ?? "__other__";
    const list = globalsByCategory.get(key) ?? [];
    list.push(c);
    globalsByCategory.set(key, list);
  }

  return (
    <>
      <div className="mb-4 sm:mb-5">
        <h1 className="text-base sm:text-lg font-semibold tracking-tight text-[#0e3e7a]">
          Case Library
        </h1>
        <div className="text-[11px] sm:text-xs text-[#5a6370] mt-1 max-w-2xl">
          Cases your crew picks from when entering vendor gear. Global presets
          come from roadcases.com and can&rsquo;t be edited; add your own
          custom cases below for the gear you actually own.
        </div>
      </div>

      {/* Org-specific cases - editable */}
      <section className="mb-6">
        <div className="flex items-baseline gap-2 mb-3">
          <h2 className="text-sm font-semibold tracking-tight text-[#0e3e7a] flex items-center gap-1.5">
            <Layers size={13} />
            Custom cases
          </h2>
          <span className="text-[10px] text-[#9ca3af] mono tracking-wider">
            {orgCases.length.toString().padStart(2, "0")}{" "}
            {orgCases.length === 1 ? "CASE" : "CASES"}
          </span>
        </div>

        <CaseLibraryClient orgCases={orgCases} />
      </section>

      {/* Global presets - read-only */}
      <section>
        <div className="flex items-baseline gap-2 mb-3">
          <h2 className="text-sm font-semibold tracking-tight text-[#0e3e7a] flex items-center gap-1.5">
            <Globe2 size={13} />
            Global presets
          </h2>
          <span className="text-[10px] text-[#9ca3af] mono tracking-wider">
            READ-ONLY · {allCases.filter((c) => c.isGlobal).length} CASES
          </span>
        </div>

        <div className="space-y-4">
          {CASE_CATEGORY_ORDER.map((cat) => {
            const items = globalsByCategory.get(cat);
            if (!items || items.length === 0) return null;
            return (
              <CategoryGroup
                key={cat}
                label={CASE_CATEGORY_LABELS[cat]}
                items={items}
              />
            );
          })}
          {globalsByCategory.has("__other__") && (
            <CategoryGroup
              label="Uncategorized"
              items={globalsByCategory.get("__other__")!}
            />
          )}
        </div>
      </section>
    </>
  );
}

function CategoryGroup({
  label,
  items,
}: {
  label: string;
  items: CaseRow[];
}) {
  return (
    <div>
      <div className="text-[10px] tracking-[0.2em] text-[#9ca3af] uppercase mb-1.5">
        {label}
      </div>
      <ul className="border border-[#e6e8eb] bg-[#f8f9fa] rounded-md divide-y divide-[#e6e8eb] overflow-hidden">
        {items.map((c) => (
          <li
            key={c.id}
            className="px-3 sm:px-4 py-2 flex items-center justify-between gap-3 hover:bg-[#eff1f4] transition-colors duration-150"
          >
            <div className="min-w-0 flex-1">
              <div className="text-[13px] text-[#272727] font-medium truncate flex items-center gap-1.5">
                <Package size={12} className="text-[#9ca3af] flex-shrink-0" />
                {c.label}
              </div>
              <div className="text-[10px] text-[#9ca3af] mono tracking-wider mt-0.5 flex flex-wrap gap-x-3">
                <span>
                  {c.depthIn}&quot; × {c.widthIn}&quot; × {c.heightIn}&quot;
                </span>
                <span>{c.weightLb} LB</span>
                <span>
                  {c.stackable ? `STACKS ×${c.maxStack}` : "NO STACK"}
                </span>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function normalizeCategory(raw: string | null): CaseCategory | null {
  if (!raw) return null;
  return (CASE_CATEGORY_ORDER as readonly string[]).includes(raw)
    ? (raw as CaseCategory)
    : null;
}
