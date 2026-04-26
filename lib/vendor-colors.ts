// Per-vendor color assignment for truck-render rectangles.
//
// Lives in lib/ rather than the truck SVG component so server components
// can call buildVendorColorMap(). The truck SVG is "use client" for drag
// handlers; if these helpers stayed there, the editor page (server) couldn't
// import them ("Attempted to call X from server but it's on the client").

export const VENDOR_COLOR_PALETTE = [
  "#0e3e7a", // Apache navy
  "#02aed6", // Apache cyan
  "#16a34a", // green
  "#ffa902", // amber
  "#9333ea", // purple
  "#0891b2", // teal
  "#ea580c", // orange-deep
  "#be185d", // pink
] as const;

export function buildVendorColorMap(
  vendorIds: readonly string[],
): Map<string, string> {
  const map = new Map<string, string>();
  vendorIds.forEach((id, i) => {
    map.set(id, VENDOR_COLOR_PALETTE[i % VENDOR_COLOR_PALETTE.length]);
  });
  return map;
}
