// Smart unit display: small things in inches, big things in feet.
//
// Per user request: "If the case or gear is small then use inches when
// showing dimensions, other than that, I want it in feet."
//
// Cutoff: >=48 inches displays in feet. Below 48", inches.
// 48" = 4 ft. Anything 4 ft or longer reads more naturally as feet
// (truss section 10', folding table 8', wardrobe box 4'); anything
// shorter stays in inches (Pelican 28", milk crate 13", etc.).

const FEET_THRESHOLD_IN = 48;

export function formatDim(inches: number): string {
  if (!Number.isFinite(inches) || inches <= 0) return "0\"";
  if (inches < FEET_THRESHOLD_IN) {
    return `${Math.round(inches)}"`;
  }
  const ft = inches / 12;
  // whole feet -> "8'"; else one decimal -> "10.5'"
  return Number.isInteger(ft) ? `${ft}'` : `${ft.toFixed(1)}'`;
}

// Formats a 3-tuple (depth x width x height) using formatDim per axis.
export function formatDims(
  depthIn: number,
  widthIn: number,
  heightIn: number,
): string {
  return `${formatDim(depthIn)} x ${formatDim(widthIn)} x ${formatDim(heightIn)}`;
}
