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
- Supabase Postgres (data only - **not Supabase Auth** in Phase 1)
- Deployed on Vercel
- Fonts: Archivo (UI) + JetBrains Mono (numerics) via `next/font`
- Icons: lucide-react only

## Auth model (Phase 1: deliberate simplification)

We swapped out per-user Supabase Auth for a **single shared
username/password gate** at the user's request. Trade-offs were
discussed and accepted: no audit trail, no per-user identity, no
magic-link friction.

- Credentials live in env vars (`APP_USERNAME`, `APP_PASSWORD`).
- A signed cookie (`atl_session`, HMAC-SHA256 over a fixed payload
  using `SESSION_SECRET`) is set on successful login and validated
  in [proxy.ts](proxy.ts) on every request.
- All DB access is server-side via the admin client in
  [lib/supabase/admin.ts](lib/supabase/admin.ts), which uses the
  Supabase **secret** key and bypasses RLS. **Never** import this
  from a client component.
- The browser never talks to Supabase directly. There is no
  `lib/supabase/client.ts`.
- The `profiles` table, `created_by` columns, `is_admin()`, the
  `handle_new_user` trigger, and the RLS policies all still exist
  in the schema - they're harmless when unused and make a future
  re-introduction of per-user identity a small lift, not a rewrite.

**Phase 2 (or whenever needed)** can layer real per-user identity
back on top: re-add Supabase Auth, populate `created_by`, gate by
`auth.uid()`. The schema already accommodates it.

## Aesthetic absolutes

Brand-matched to apacherentalgroup.com. Color palette pulled from
the marketing site itself, not invented. Light mode by client choice.

- **Light only.** Background `#ffffff`. No dark mode toggle.
- **Apache navy `#0e3e7a`** is the primary accent (buttons, focus
  rings, the logo square, active state borders). Use sparingly -
  it's an accent, not a fill.
- **Apache bright blue `#02aed6`** is the hover/secondary accent
  (button hover state, link hover, lighter emphasis).
- **Apache orange `#ffa902` / `#ff7302`** for capacity warnings
  (>75% full, >95% full). Real risk. Don't reach for it casually.
- **No rounded-xl, no shadows, no gradients on UI chrome.** Hairline
  borders (`#e6e8eb` subtle / `#d1d5db` default / `#9ca3af` strong),
  `rounded` or `rounded-md` max.
- **Numerics use JetBrains Mono with `tabular-nums`.** Always. A
  capacity readout that jitters because digits have different widths
  is broken.
- **Typography tracking.** UPPERCASE labels get `tracking-[0.15em]`
  to `tracking-[0.2em]`. Tight.
- **Motion is restrained.** 150ms transitions on hover, 400-500ms on
  capacity fills. No bouncy springs. No scroll-triggered reveal
  animations on core UI.

If a design decision feels ambiguous, reference apacherentalgroup.com
itself, or Linear / Vercel dashboard light mode. If it looks like it
belongs in a generic SaaS template, it's wrong.

### Full color tokens (in `app/globals.css`)

| Token | Hex | Use |
|---|---|---|
| `--color-bg` | `#ffffff` | page background |
| `--color-panel` | `#f8f9fa` | card backgrounds |
| `--color-panel-raised` | `#eff1f4` | elevated surfaces |
| `--color-border-subtle` | `#e6e8eb` | hairline dividers |
| `--color-border` | `#d1d5db` | default borders |
| `--color-border-strong` | `#9ca3af` | emphasized borders |
| `--color-fg` | `#272727` | primary text |
| `--color-fg-muted` | `#5a6370` | secondary text |
| `--color-fg-subtle` | `#9ca3af` | tertiary text / placeholders |
| `--color-accent` | `#0e3e7a` | Apache navy - buttons, focus, accent |
| `--color-success` | `#16a34a` | "fits with room" status |
| `--color-warning` | `#ffa902` | tight load warning |
| `--color-warning-strong` | `#ff7302` | very tight warning |
| `--color-danger` | `#dc2626` | over capacity, errors |

Hover for the navy accent uses `#02aed6` (Apache bright blue). Not
in `@theme` because it's only used as `hover:bg-[#02aed6]`.

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

## Manual placements (drag-to-anchor)

`vendors.manual_placements` is a JSONB array indexed by item position
within the vendor's expansion (item 0..qty-1). Entries are
`{xIn, yIn}` (truck inches, snapped to a 6" grid) or `null` for
"auto-pack this item." The packer pre-places anchored items as locked
shelves at their saved positions, then the existing cross-vendor
algorithm fills around them with slot-aware ground placement (auto
items can squeeze into the y-gaps next to manual ones in the same
shelf). Stacking on top of manually-anchored bases happens
automatically. Per-truck "Reset placements" in TruckSettingsBar wipes
every anchor on a truck and falls back to pure auto-pack. Drag is
top-view only in v1; side view is read-only.

## Multi-truck data model

A job has N trucks via `public.job_trucks` (one row per truck). Vendors
are pinned to a specific truck via `vendors.job_truck_id`. Each truck
holds its own `truck_type`, `custom_truck_id`, `label`, `buffer_pct`,
and `sort_order` - those fields no longer exist on `jobs`. Each truck
packs **independently** (one `packVendors` call per truck with its own
`truckCrossSection`); roll-up totals sum across trucks. The editor uses
the `?truck=<id>` query param to track the active tab; default is the
first truck by `sort_order`. A job must always have at least one truck
(`createJobAction` seeds one and `deleteJobTruckAction` blocks the
last).

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
