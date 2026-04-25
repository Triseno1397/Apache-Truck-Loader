# CLAUDE.md - Apache Truck Loader

Project instructions for Claude Code when working in this repo.

## What this is

A production web app for Apache Rental Group's crew to plan gear loads for 26ft Penske box trucks and 53ft semis. Vendors send us their gear specs in whatever format they use; we canonicalize everything to linear feet and show real-time capacity utilization with an animated side-view truck render.

Built by Triseno Systems. Deployed on `apacherentalgroup.com` subdomain via Vercel.

## Full spec

See `docs/apache-truck-loader-spec.md` for the complete feature and data-model specification. That doc is the source of truth. This file is working principles.

## Stack

- Next.js 15+ (App Router) + TypeScript strict
- Tailwind CSS v4 (no component libraries - write components from scratch)
- Supabase (Postgres + Auth + RLS + realtime)
- Deployed on Vercel
- Fonts: Archivo (UI) + JetBrains Mono (numerics) via `next/font`
- Icons: lucide-react only

## Aesthetic absolutes

- **Dark only.** No light mode. Background `#0a0b0d`.
- **Cyan accent `#00d4ff`** is the Apache / Blackmagic signature color. Use sparingly - it's an accent, not a fill.
- **No rounded-xl, no shadows, no gradients on UI chrome.** Hairline borders (`#1f2328` to `#3a4049`), `rounded` or `rounded-md` max.
- **Numerics use JetBrains Mono with `tabular-nums`.** Always. A capacity readout that jitters because digits have different widths is broken.
- **Typography tracking.** UPPERCASE labels get `tracking-[0.15em]` to `tracking-[0.2em]`. Tight.
- **Motion is restrained.** 150ms transitions on hover, 400-500ms on capacity fills. No bouncy springs. No scroll-triggered reveal animations on core UI.

If a design decision feels ambiguous, reference: Blackmagic DaVinci Resolve control surfaces, Linear app, Vercel dashboard. If it looks like it belongs in a generic SaaS template, it's wrong.

## Mobile is not a subset

The crew uses this on phones at loading docks. Mobile is a first-class target. Any feature that exists on desktop must work on mobile with the same fluency. Specifically:

- Touch targets >= 44x44px
- Form inputs that open native pickers where appropriate (date pickers, number pads)
- Sheets slide up from bottom on mobile, dismissible via swipe
- Sticky action bar at viewport bottom on editor screens
- Optimistic UI - every interaction feels instant
- Handle network failures gracefully; queue writes when offline

Test every feature on an actual phone viewport before considering it done.

## Data safety

- **Auto-save is non-negotiable.** Every edit debounces a write to Supabase within 600ms. User never loses work.
- **Status indicator** in header shows `SAVING...` -> `SAVED` state.
- **Optimistic updates** - render immediately, confirm on roundtrip, surface errors as toasts if they fail.
- **Snapshots** are separate from auto-saves - an explicit immutable checkpoint the user creates when a plan is confirmed.

## Packing math is core IP

The smart 3D packing logic (width-aware pairing + height-aware stacking) is what makes this tool valuable. Do not simplify it. Do not replace it with cubic-feet-divided-by-64. See spec for the algorithm. All the logic lives in `lib/packing.ts` - everything else consumes it.

## TypeScript rules

- `strict: true` in tsconfig
- No `any`. No `@ts-ignore`. No `as unknown as Foo` casts except at true trust boundaries (e.g., Supabase JSONB payloads, and only with a runtime validator).
- Every Supabase table gets a generated type via the Supabase CLI; consume those types everywhere.
- Zod for runtime validation of anything crossing a boundary (form inputs, API responses, JSONB payloads).

## File organization

```
app/
  (auth)/
    login/
  (app)/
    jobs/
      page.tsx              # job list
      [id]/
        page.tsx            # job editor
    settings/
      trucks/
      cases/
      users/
  api/                      # route handlers where needed
components/
  truck/
    TruckSVG.tsx
    CapacityBars.tsx
  vendor/
    VendorForm.tsx
    VendorRow.tsx
    InputMethods/           # one file per input method
  job/
    JobCard.tsx
    JobHeader.tsx
  ui/                       # primitives (Button, Sheet, Toast, etc.)
lib/
  packing.ts                # 3D packing logic - core module
  trucks.ts                 # truck presets + custom truck helpers
  cases.ts                  # case library helpers
  supabase/
    client.ts
    server.ts
    middleware.ts
    types.ts                # generated Supabase types
hooks/
  useAutoSave.ts
  useJob.ts
styles/
  globals.css
```

## Testing approach

- Vitest for unit tests on `lib/packing.ts` - every conversion function gets tested with real-world scenarios (8 Pelican 1620s -> 4.7 ft, 24 Pelican 1510s -> 1.8 ft, 2 pallets -> 4 ft, etc.)
- Playwright for critical flows: create job -> add vendors -> save snapshot -> reopen -> verify state preserved
- No exhaustive component-level tests - focus test effort on the math and the persistence layer

## Commit style

- Conventional commits (feat, fix, chore, refactor, test, docs)
- Small atomic commits - one concern per commit
- Commits push to a working branch; PRs reviewed before merge to main
- Auto-deploy to Vercel preview on PR, production on main merge

## Out of scope (Phase 2+)

Ignore these until explicitly enabled:
- Vendor self-report links
- AI image vision analysis
- Load-order tracking
- Multi-truck split loads
- Delta tracking (actual vs. estimated)
- Realtime crew collaboration

The data model accommodates these - don't design them away - but don't build UI or logic for them in Phase 1.

## When you hit ambiguity

Ask. Don't guess at product decisions. Especially on:
- Visual details that aren't specified in the aesthetic section
- UX flows that touch mobile-specific behavior
- Trade-offs between complexity and correctness

Default to simpler + more correct over clever.
