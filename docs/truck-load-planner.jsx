import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Trash2, Save, FolderOpen, Image, X, AlertTriangle, Check, Package, Ruler, Box, Upload, FileText, Layers } from 'lucide-react';

// -----------------------------------------------------------
// TRUCK SPECS (confirmed from manufacturer data)
// -----------------------------------------------------------
const TRUCKS = {
  '26ft': {
    label: '26ft Penske Box Truck',
    shortLabel: '26ft Box',
    interiorLengthFt: 25.92,
    interiorWidthFt: 8.08,
    interiorHeightFt: 8.58,
    cubicFeet: 1700,
    cargoWeightLb: 10000,
    liftgateLb: 3000,
    hasLiftgate: true,
  },
  '53ft': {
    label: '53ft Semi Trailer',
    shortLabel: '53ft Semi',
    interiorLengthFt: 52.5,
    interiorWidthFt: 8.25,
    interiorHeightFt: 9.0,
    cubicFeet: 4054,
    cargoWeightLb: 43000,
    liftgateLb: null,
    hasLiftgate: false,
  },
};

// -----------------------------------------------------------
// CASE PRESET LIBRARY
// depthIn = dimension along truck length (loaded depth)
// widthIn = dimension across truck width (drives side-by-side pairing)
// heightIn = drives vertical stacking
// stackable = can be stacked at all
// maxStack = practical layer cap for stability/safety (truck height is
//            also a physical cap; we take the min of the two)
// -----------------------------------------------------------
const CASE_PRESETS = [
  { id: 'pelican_1510', label: 'Pelican 1510',            depthIn: 22, widthIn: 14, heightIn: 9,  weightLb: 14,  stackable: true,  maxStack: 6 },
  { id: 'pelican_1610', label: 'Pelican 1610',            depthIn: 25, widthIn: 20, heightIn: 12, weightLb: 22,  stackable: true,  maxStack: 5 },
  { id: 'pelican_1620', label: 'Pelican 1620',            depthIn: 28, widthIn: 21, heightIn: 13, weightLb: 30,  stackable: true,  maxStack: 5 },
  { id: 'pelican_1650', label: 'Pelican 1650',            depthIn: 32, widthIn: 21, heightIn: 14, weightLb: 35,  stackable: true,  maxStack: 4 },
  { id: 'skb_4u',       label: 'SKB 4U Shock Rack',       depthIn: 26, widthIn: 22, heightIn: 15, weightLb: 40,  stackable: true,  maxStack: 4 },
  { id: 'skb_6u',       label: 'SKB 6U Shock Rack',       depthIn: 26, widthIn: 22, heightIn: 20, weightLb: 60,  stackable: true,  maxStack: 3 },
  { id: 'skb_10u',      label: 'SKB 10U Shock Rack',      depthIn: 32, widthIn: 28, heightIn: 24, weightLb: 120, stackable: true,  maxStack: 2 },
  { id: 'road_sm',      label: 'Road case (small)',       depthIn: 30, widthIn: 22, heightIn: 18, weightLb: 35,  stackable: true,  maxStack: 3 },
  { id: 'road_md',      label: 'Road case (medium)',      depthIn: 36, widthIn: 26, heightIn: 22, weightLb: 60,  stackable: true,  maxStack: 3 },
  { id: 'road_lg',      label: 'Road case (large)',       depthIn: 48, widthIn: 30, heightIn: 30, weightLb: 100, stackable: true,  maxStack: 2 },
  { id: 'cable_trunk',  label: 'Cable trunk',             depthIn: 48, widthIn: 32, heightIn: 32, weightLb: 180, stackable: false, maxStack: 1 },
  { id: 'camera_case',  label: 'Camera flight case',      depthIn: 30, widthIn: 22, heightIn: 12, weightLb: 45,  stackable: true,  maxStack: 5 },
  { id: 'tripod_case',  label: 'Tripod / sticks case',    depthIn: 48, widthIn: 10, heightIn: 10, weightLb: 40,  stackable: true,  maxStack: 2 },
  { id: 'pallet',       label: 'Standard pallet (48x40)', depthIn: 48, widthIn: 40, heightIn: 48, weightLb: 500, stackable: false, maxStack: 1 },
  { id: 'custom',       label: 'Custom / unknown',        depthIn: 24, widthIn: 24, heightIn: 24, weightLb: 50,  stackable: false, maxStack: 1 },
];

// -----------------------------------------------------------
// CONVERSIONS - canonical unit is LINEAR FEET
// Packing is 3D-aware: items pack across the truck WIDTH
// (side-by-side) and vertically in HEIGHT (stacked), then
// fill along the truck LENGTH in rows.
// Matches how crews actually load: pallets in pairs,
// Pelicans 3-4 across and stacked 5-6 high to the ceiling.
// -----------------------------------------------------------
const TRUCK_CROSS_SECTION_SQFT = 64;

function cubicFeetToLinearFeet(cuFt) {
  return cuFt / TRUCK_CROSS_SECTION_SQFT;
}

function footprintToLinearFeet(sqFt) {
  return sqFt / 8; // 8ft wide truck
}

// Smart 3D packing. Items pack side-by-side across the truck width
// AND stacked vertically (when stackable), then fill along the length.
// Returns { linearFt, perRow, layers, rows } for display.
function packItemsIntoRows({ depthIn, widthIn, heightIn, quantity, stackable, maxStack, truckWidthIn, truckHeightIn }) {
  const qty = Math.max(0, quantity || 0);
  if (qty === 0 || depthIn <= 0 || widthIn <= 0) {
    return { linearFt: 0, perRow: 0, rows: 0, layers: 1, perCross: 0 };
  }

  const perRow = Math.max(1, Math.floor(truckWidthIn / widthIn));

  let layers = 1;
  if (stackable && heightIn > 0 && truckHeightIn > 0) {
    const physicalMax = Math.floor(truckHeightIn / heightIn);
    const safetyMax = Math.max(1, maxStack || 1);
    layers = Math.max(1, Math.min(physicalMax, safetyMax));
  }

  const perCross = perRow * layers;      // items per cross-sectional slice
  const rows = Math.ceil(qty / perCross); // rows needed along truck length
  const linearFt = rows * (depthIn / 12);

  return { linearFt, perRow, layers, rows, perCross };
}

// -----------------------------------------------------------
// VENDOR LINE ITEM - compute canonical linear feet
// Also returns an optional packing breakdown for the UI.
// -----------------------------------------------------------
function computeVendorPacking(vendor, truck = { widthIn: 96, heightIn: 96 }) {
  const input = vendor.input || {};
  const truckWidthIn = truck.widthIn;
  const truckHeightIn = truck.heightIn;

  const buildExplain = (qty, packed) => {
    if (qty <= 1) return null;
    const stackLabel = packed.layers > 1 ? ` x ${packed.layers} high` : '';
    return `${packed.perRow} across${stackLabel} x ${packed.rows} row${packed.rows > 1 ? 's' : ''}`;
  };

  switch (vendor.inputMethod) {
    case 'linear':
      return { linearFt: parseFloat(input.linearFt) || 0 };
    case 'cubic':
      return { linearFt: cubicFeetToLinearFeet(parseFloat(input.cubicFt) || 0) };
    case 'footprint':
      return { linearFt: footprintToLinearFeet(parseFloat(input.sqFt) || 0) };
    case 'dimensions': {
      const L = parseFloat(input.lengthIn) || 0;
      const W = parseFloat(input.widthIn) || 0;
      const H = parseFloat(input.heightIn) || 0;
      const qty = parseFloat(input.quantity) || 1;
      // Default stackable = true for short items (<18" tall) unless explicitly unchecked
      const stackable = input.stackable !== undefined ? input.stackable : (H > 0 && H < 18);
      const maxStack = 6; // generic safety cap for unknown cases
      const packed = packItemsIntoRows({
        depthIn: L, widthIn: W, heightIn: H, quantity: qty,
        stackable, maxStack, truckWidthIn, truckHeightIn,
      });
      return { ...packed, stackable, explain: buildExplain(qty, packed) };
    }
    case 'pallets': {
      const qty = parseFloat(input.palletCount) || 0;
      const stackable = input.stackable === true; // default OFF for pallets
      const packed = packItemsIntoRows({
        depthIn: 48, widthIn: 40, heightIn: 48, quantity: qty,
        stackable, maxStack: 2, truckWidthIn, truckHeightIn,
      });
      return { ...packed, stackable, explain: buildExplain(qty, packed) };
    }
    case 'pieces': {
      const preset = CASE_PRESETS.find((p) => p.id === input.caseType);
      if (!preset) return { linearFt: 0 };
      const qty = parseFloat(input.quantity) || 0;
      const stackable = input.stackable !== undefined ? input.stackable : !!preset.stackable;
      const packed = packItemsIntoRows({
        depthIn: preset.depthIn, widthIn: preset.widthIn, heightIn: preset.heightIn, quantity: qty,
        stackable, maxStack: preset.maxStack, truckWidthIn, truckHeightIn,
      });
      return { ...packed, stackable, explain: buildExplain(qty, packed) };
    }
    case 'image':
      return { linearFt: parseFloat(input.estimatedLinearFt) || 0 };
    default:
      return { linearFt: 0 };
  }
}

function computeVendorLinearFeet(vendor, truck) {
  return computeVendorPacking(vendor, truck).linearFt;
}

function computeVendorWeight(vendor) {
  const input = vendor.input || {};
  // If weight directly entered, use that
  if (input.weightLb !== undefined && input.weightLb !== '' && !isNaN(parseFloat(input.weightLb))) {
    return parseFloat(input.weightLb);
  }
  // For piece presets, auto-calc from preset x qty
  if (vendor.inputMethod === 'pieces') {
    const preset = CASE_PRESETS.find((p) => p.id === input.caseType);
    if (preset) {
      return preset.weightLb * (parseFloat(input.quantity) || 0);
    }
  }
  return 0;
}

// NOTE: This prototype file is the working reference for packing math and
// visual behavior. The production build lives in app/ + components/ +
// lib/packing.ts. Port logic intentionally; do not dump-import this JSX
// into the Next.js project.

export { TRUCKS, CASE_PRESETS, computeVendorPacking, computeVendorLinearFeet, computeVendorWeight };
