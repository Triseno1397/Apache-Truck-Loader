# Apache Truck Loader - Project Specification

**Client:** Apache Rental Group
**Built by:** Triseno Systems
**Version:** 1.0 (Production build)
**Based on:** Working prototype (truck-load-planner.jsx)

---

## Project Overview

A web-based tool for the Apache Rental Group crew to plan truck loads for live events. Vendors send gear to Apache for trucking, and the crew needs to know - before the truck shows up - whether all the gear will fit in a 26ft Penske box truck or whether they need to step up to a 53ft semi.

The tool accepts vendor-quoted gear info in many formats (linear feet, dimensions, piece counts, pallets, cubic feet, images) and canonicalizes everything to **linear feet** so the crew can see total truck utilization in real time against a fixed-capacity container. Side-view SVG truck renders visually fill as vendors are added.

**Primary user:** Apache crew coordinators planning loads (desktop + mobile, often on-site at staging dock)
**Secondary user (Phase 2):** External vendors filling in their own gear via self-report links
**Audience for the working deliverable:** This is a real operational tool used by a working production company, not a demo. Quality and reliability matter.

---

## Core Principles

1. **Mobile-first, fully functional on mobile.** The crew uses phones at loading docks. All features - adding, editing, deleting vendors, switching trucks, saving jobs, loading past jobs - must work flawlessly on a phone. No features get amputated for mobile.
2. **Save everything automatically.** Inputs persist as the user types. No "did I remember to save?" anxiety. Explicit Save button snapshots the job into history, but the current working state survives refreshes.
3. **Job history is first-class.** Accessing past loads, duplicating a job as a template for a similar upcoming job, and editing old jobs is as easy as creating a new one.
4. **Dark, precise, broadcast-engineering aesthetic.** Blackmagic Design / Linear / Vercel visual language. No generic Bootstrap or Material. See Aesthetic section below.
5. **Smart packing math is core IP.** Width-aware pairing and stack-aware vertical filling. See Packing Logic section.

---

## Tech Stack

- **Framework:** Next.js 15+ (App Router)
- **Language:** TypeScript (strict mode)
- **Styling:** Tailwind CSS v4
- **Database + Auth:** Supabase (Postgres + Supabase Auth)
- **Deployment:** Vercel, on subdomain `load.apacherentalgroup.com` (or `truck.apacherentalgroup.com` - coordinate with Triseno)
- **Icons:** lucide-react
- **Fonts:** Archivo (UI), JetBrains Mono (numerics)
- **State:** React hooks + Supabase realtime for crew sync
- **Vision (Phase 2):** Anthropic API (`claude-sonnet-4-5` or newer) for case recognition from photos

---

## Aesthetic & Design System

> **Phase 1 reality (changed from spec by client request):** the
> palette was switched from the original dark broadcast-engineering
> theme to a light theme matched to apacherentalgroup.com. Colors
> below reflect the **current** palette. The original dark spec is
> preserved in git history if we ever want to revisit.

**Reference points:** apacherentalgroup.com (the brand source of
truth), Linear, Vercel dashboard light mode.

**Colors (light, brand-matched):**
- Background: `#ffffff` (white)
- Panel: `#f8f9fa`
- Panel elevated: `#eff1f4`
- Border subtle: `#e6e8eb`
- Border default: `#d1d5db`
- Border strong: `#9ca3af`
- Text primary: `#272727` (Apache near-black)
- Text secondary: `#5a6370`
- Text tertiary: `#9ca3af`
- Accent primary: `#0e3e7a` (Apache navy)
- Accent hover: `#02aed6` (Apache bright blue)
- Accent success: `#16a34a`
- Accent warning: `#ffa902` (Apache orange)
- Accent warning-severe: `#ff7302`
- Accent danger: `#dc2626`

**Typography:**
- UI / labels / body: Archivo (400, 500, 600, 700)
- Numerics / readouts / code-like: JetBrains Mono
- Tracking: UPPERCASE labels use `tracking-[0.15em]` to `tracking-[0.2em]`
- Sizes kept tight - 10px-13px for labels, 13px-15px for body

**Motion:**
- Transitions on hover/interaction: `transition` (150ms default)
- Capacity bar fills: `transition-all duration-500`
- SVG truck fill: `transition: width 0.4s ease-out`

**Pattern rules:**
- Never round corners more than `rounded-md`. Most elements are `rounded` or `rounded-sm`.
- Borders over shadows. Hairline 1px borders everywhere. No drop shadows.
- Dense information layout - generous line-height inside text but tight between UI elements.
- `tabular-nums` always applied to numeric displays so values don't jitter during updates.

---

## Data Model (Supabase)

### Tables

#### `organizations`
- `id` uuid PK
- `name` text (e.g., "Apache Rental Group")
- `created_at` timestamptz
- Used for future multi-tenant support. Apache is first tenant.

#### `users`
Managed by Supabase Auth. Extended with:
- `org_id` uuid FK -> organizations
- `role` enum: `admin`, `crew`, `viewer`
- `display_name` text

#### `jobs`
- `id` uuid PK
- `org_id` uuid FK -> organizations
- `name` text (e.g., "Coachella Mainstage - Friday load")
- `client` text (optional - for searching past loads by client)
- `event_date` date (optional)
- `truck_type` enum: `26ft_penske`, `53ft_semi`, `custom`
- `custom_truck_id` uuid FK -> custom_trucks (nullable, used when truck_type = 'custom')
- `status` enum: `draft`, `confirmed`, `loaded`, `archived`
- `buffer_pct` int (default 10) - safety margin added to capacity calcs
- `notes` text
- `created_by` uuid FK -> users
- `created_at` timestamptz
- `updated_at` timestamptz
- Indexes on `org_id`, `client`, `event_date DESC`, `updated_at DESC`

#### `vendors`
- `id` uuid PK
- `job_id` uuid FK -> jobs (cascade delete)
- `name` text
- `input_method` enum: `linear`, `dimensions`, `pieces`, `cubic`, `footprint`, `pallets`, `image`
- `input_data` jsonb - method-specific payload (see prototype for shape)
- `stackable` boolean (nullable - null means "use default for this method")
- `weight_lb_override` numeric (nullable - overrides computed)
- `notes` text
- `sort_order` int (for future load-order Phase 2 feature)
- `created_at` timestamptz
- Index on `job_id`

#### `custom_trucks`
- `id` uuid PK
- `org_id` uuid FK
- `label` text (e.g., "24ft GMC box truck")
- `interior_length_ft` numeric
- `interior_width_ft` numeric
- `interior_height_ft` numeric
- `cubic_feet` numeric (derived or stored)
- `cargo_weight_lb` numeric
- `has_liftgate` boolean
- `liftgate_lb` numeric (nullable)
- `created_at` timestamptz

#### `case_library`
- `id` uuid PK
- `org_id` uuid FK (nullable - null means global/built-in)
- `label` text
- `depth_in`, `width_in`, `height_in` numeric
- `weight_lb` numeric
- `stackable` boolean
- `max_stack` int
- `reference_image_url` text (nullable)
- `created_at` timestamptz

**Seed data:** Ship with the 15 presets from the prototype as `org_id = null` global records. Apache can add custom cases as they encounter them (e.g., "Keslow Alexa 35 kit case").

#### `vendor_self_reports` *(Phase 2)*
- `id` uuid PK
- `job_id` uuid FK
- `token` text unique (for magic link auth)
- `vendor_name` text
- `submitted_at` timestamptz
- `approved_at` timestamptz (nullable)
- `input_data` jsonb
- Allows vendors to submit gear info via generated link; Apache crew reviews before it counts toward totals.

### Row-Level Security

- All tables gated by `org_id` match to authenticated user's org_id.
- `case_library` readable when `org_id IS NULL` (global) OR `org_id = auth.user.org_id`.
- Self-report tokens bypass auth via magic link RLS exception.

---

## Packing Logic (3D-aware, from prototype)

Canonical unit: **linear feet** along truck length.

### Inputs -> linear feet conversion

- **Linear feet:** direct value
- **Cubic feet:** `cu_ft / 64` (assumes 8x8 ft cross-section)
- **Footprint (sq ft):** `sq_ft / 8` (8ft truck width)
- **Dimensions + quantity:** smart 3D packing (see below)
- **Pieces + case preset:** smart 3D packing using preset dimensions
- **Pallets:** smart 3D packing of 48"x40" pallets (pair side-by-side by default)
- **Image upload:** estimated linear feet (manual Phase 1, AI Phase 2)

### Smart 3D packing algorithm

For items with known L x W x H and quantity:
```
perRow = max(1, floor(truck_width_in / item_width_in))
layers = stackable ? max(1, min(floor(truck_height_in / item_height_in), max_stack)) : 1
perCrossSection = perRow * layers
rows = ceil(quantity / perCrossSection)
linearFt = rows * (item_depth_in / 12)
```

**Truck dimensions (inches):**
- 26ft Penske: width 97", height 103" (from 8'1" x 8'7")
- 53ft semi: width 99", height 108" (from 8'3" x 9'0")

**Why this matters:** 8 Pelican 1620s = 4.7 linear ft (4 across x 2 rows), not 8ft. 24 Pelican 1510s = 1.8 linear ft (6 across x 6 high x 1 row), not 22ft. This is the difference between "won't fit, need the semi" and "easy, plenty of room."

### Stackability defaults (built-in presets)

| Case | Stackable | Max stack |
|---|---|---|
| Pelican 1510/1610/1620/1650 | yes | 6/5/5/4 |
| SKB 4U/6U/10U Shock Rack | yes | 4/3/2 |
| Road case sm/md/lg | yes | 3/3/2 |
| Cable trunk | no | 1 |
| Camera flight case | yes | 5 |
| Tripod case | yes | 2 |
| Standard pallet | no (user-togglable) | 1 |

### Buffer percentage

Jobs have a `buffer_pct` (default 10%). Applied capacity = `truck.cargoLength * (1 - bufferPct/100)`. This accounts for cable ramps, gaff tape kits, misc gear, and crew tie-down space that never makes it onto the load sheet. Display as "effective capacity" alongside raw capacity.

### Auto-save debounced writes

As user edits inputs, debounce writes to Supabase by 600ms. Show subtle "saving..." / "saved" indicator in the corner. Optimistic UI - updates render immediately.

---

## Feature Spec

### 1. Authentication

> **Phase 1 reality (changed from spec by client request):** A single
> shared username/password gate. No per-user identity, no email step,
> no audit trail. Credentials live in env vars (`APP_USERNAME` /
> `APP_PASSWORD`); a signed cookie persists the session for ~1 year.
> The full per-user model below is preserved as the Phase 2 roadmap;
> the DB schema (profiles, created_by, RLS, etc.) already accommodates
> it without migration.

**Phase 2 (target):**

- Email magic link via Supabase Auth
- Admin can invite crew members via email
- Roles:
  - **Admin:** full access, manages users and custom trucks
  - **Crew:** create/edit/delete jobs and vendors, cannot manage users
  - **Viewer:** read-only (for clients who want visibility without edit rights)
- First login on new org: onboarding flow to set org name, add first custom truck if needed

### 2. Job list / home screen

**Mobile-first layout:**
- Top bar: Apache logo, user menu, "+ New Job" CTA (prominent)
- Search bar (searches name, client, notes)
- Filter chips: Status (Draft / Confirmed / Loaded / Archived), Date range
- Job cards with:
  - Job name (bold)
  - Client name (secondary)
  - Event date + days away indicator ("IN 3 DAYS" in amber if within week)
  - Truck type badge
  - Load status bar (mini version of capacity gauge)
  - Quick actions: Open, Duplicate, Archive, Delete (swipe on mobile, dropdown on desktop)
- Infinite scroll, sorted by `updated_at DESC` by default
- Empty state: large "Create your first job" CTA

### 3. Job detail / editor (the main screen)

Same fundamental layout as the prototype, upgraded with:

**Header area:**
- Editable job name (click to edit, auto-save on blur)
- Client name field (optional)
- Event date picker (optional)
- Status dropdown (Draft -> Confirmed -> Loaded -> Archived)
- Notes field (collapsible)

**Truck selector:**
- Tabs: 26ft Penske / 53ft Semi / + Custom Truck
- Tapping "+ Custom Truck" opens modal to add/select org-specific truck
- Can change truck mid-load; all vendor math recomputes instantly

**Truck visualization:**
- Side-view SVG (from prototype), full-width on mobile
- Fills cyan -> amber -> red as load increases
- % indicator above, length dimension below
- Fill animation on any vendor change

**Capacity dashboard:**
- Length bar with used / total ft + % full
- Weight bar with used / total lb + % loaded
- Buffer indicator (shows effective capacity line)
- Over-capacity warnings in red with specific overage amount

**Vendor list:**
- Cards/rows with vendor name, input method icon, linear ft, weight, stack badge
- Tap to expand inline edit (mobile) or open side panel (desktop)
- Drag to reorder (becomes load-order in Phase 2)
- Quick-add button floating at bottom on mobile, inline button on desktop

**Vendor add/edit form:**
- All 7 input methods from prototype
- Stackable toggle where applicable
- Live preview showing computed linear ft, weight, and packing breakdown
- Weight field auto-fills from preset, user can override
- Notes field
- Mobile: full-screen sheet; Desktop: inline expanded card

### 4. Mobile-specific behaviors

- **Touch targets minimum 44x44px** (Apple HIG) for all interactive elements
- **Form sheets slide up from bottom** on mobile (iOS-style), dismissible by swipe down
- **Single-column layout** below 768px; two-column (truck viz + vendor list side-by-side) at >= 1024px
- **Sticky action bar** at bottom of viewport on job detail screen: Save Snapshot / Share / More
- **Pull-to-refresh** on job list
- **Haptic feedback** on successful save (where supported via Vibration API)
- **Optimistic UI** - every action feels instant, errors surface as subtle toasts
- **Works offline for reads** - service worker caches recent jobs; writes queue and sync on reconnect (stretch goal; at minimum, handle network failures gracefully)
- **PWA:** installable to home screen so the app is always one tap away without remembering a URL.

### 5. Auto-save + snapshot model

Two kinds of saves:

**Auto-save (continuous):** As user edits job name, adds/edits vendors, switches trucks - all changes debounce-write to Supabase within 600ms. Status pill in header shows `SAVING...` -> `SAVED` -> fades. Never lose work.

**Snapshot save (explicit):** User hits "Save Snapshot" to create a named checkpoint of the job. Useful for "this is the plan we're committing to" moment. Snapshots are immutable rows in a `job_snapshots` table (copy of job + vendors at moment of save). Users can view and restore any snapshot.

### 6. Job history access

From main job list:
- All jobs sorted by recency, searchable, filterable
- Tap past job -> opens in full editor (just like any active job)
- "Duplicate as new job" option preserves vendor list, clears dates, sets status to Draft
- Archive vs delete: archive hides from default list but searchable; delete is soft-delete (30-day recovery window)

Within a job:
- "View snapshots" panel shows all past saved snapshots with timestamp and user
- Restore any snapshot (creates new snapshot of current state first as backup)

### 7. Custom trucks

Admins can define additional trucks for their fleet:
- Label (e.g., "16ft GMC Sprinter")
- Interior L x W x H
- Cargo weight capacity
- Liftgate toggle + capacity
- Custom trucks appear in truck selector for all org users

### 8. Case library management

Admin screen to:
- View built-in case library (read-only, global)
- Add org-specific cases (e.g., "Keslow Alexa 35 camera case - 32"x18"x14", 45 lb, stackable 3 high")
- Upload reference photo for each case (used for Phase 2 vision recognition)
- Edit / delete org cases

### 9. Export & share

- PDF export of load sheet (vendor list + totals + truck viz)
- CSV export of vendors
- Shareable read-only link (for client or vendor visibility) - generates token-based view URL

---

## Phase 1 additions (added by client request after initial spec)

These were added during build, not in the original spec, but are in
scope for v1:

- **Multi-truck per job.** Originally Phase 2 ("split loads"), pulled
  forward: a single job can have N trucks, each independently packed.
  Crew often loads two 26ft Penskes for one event.
- **Drag-and-drop on the truck render.** Manually rearrange item
  rectangles inside the cargo box if you want to override the auto
  packer (Tetris mode). Persisted manual placements override the
  algorithm for that vendor's items until cleared.
- **Smart unit display.** Dimensions render in inches if <48in (small
  cases) and in feet if >=48in (long items, truck dims). One helper
  in [lib/units.ts](../lib/units.ts).
- **`can_be_base` per vendor.** Independent of `stackable`. The old
  single flag conflated "this gear stacks ON TOP of others" with
  "OTHER gear can be stacked on top of this." Now they're separate.
  Default for both: follows the case preset.
- **Vendor name on the truck render.** Each item rectangle shows the
  vendor name in small black text inside the rectangle (truncated to
  fit; hidden if rect is too small).

## Phase 2 (post-launch, separate spec)

Listed so the data model accommodates them without refactor:

1. **Vendor self-report links.** Generate per-vendor magic link; vendor fills in their row; Apache reviews and approves.
2. **Actual vs. estimated delta tracking.** After load is complete, user logs actual linear feet used. Tool learns which vendors lowball and which overestimate. Display historical accuracy per vendor.
3. **AI image analysis.** User uploads photo of staged gear; Claude Vision identifies visible cases, pulls dimensions from case library, returns estimated linear ft. Includes confidence score.
4. **Load order tracking.** Drag-to-reorder vendor list; "first on, last off" or reverse; export ordered load plan for driver.
5. ~~Multi-truck split loads~~ - moved to Phase 1.
6. **Crew-level permissions on individual jobs.** Not everyone should see every client's job.
7. **Realtime collaboration.** Multiple crew members editing the same job see each other's changes live (Supabase realtime channels).

---

## Build Order (recommended)

1. Scaffold Next.js + Tailwind + Supabase + Auth (1-2 hrs)
2. DB schema + RLS policies (1-2 hrs)
3. Core types + packing logic module (port from prototype) (1 hr)
4. Job list / job detail scaffolding (3-4 hrs)
5. Vendor CRUD with all input methods (3-4 hrs)
6. Truck SVG visualization component (port from prototype) (1 hr)
7. Capacity bars + status indicators (1 hr)
8. Auto-save + snapshot system (2-3 hrs)
9. Custom truck management (1-2 hrs)
10. Case library admin (1-2 hrs)
11. Mobile UX pass - touch targets, sheets, sticky bars (2-3 hrs)
12. Search + filters on job list (1-2 hrs)
13. Export (PDF + CSV) (2-3 hrs)
14. Deploy to Vercel subdomain + DNS (30 min)

Total estimate: ~25-35 hours of focused Claude Code work, broken into sessions.

---

## Reference Files

- `docs/truck-load-planner.jsx` - working Phase 1 prototype (use as visual and logic reference; do not copy-paste wholesale - the production TS/Next.js implementation should be its own codebase with proper separation of concerns)

## Questions to resolve before building

1. Subdomain choice: `load.apacherentalgroup.com`? Confirm with Triseno.
2. Supabase org already exists or create new? Use existing Triseno Systems Supabase org if possible.
3. Number of crew seats needed at launch? Affects Supabase auth plan.
4. Any existing Apache Rental Group brand assets (logo, color anchors) to incorporate into header? Or pure Triseno Systems aesthetic?
5. Client-facing share links - do clients need login, or anonymous token is fine?

---

## Visual and UX references

- Prototype artifact: `docs/truck-load-planner.jsx` (current working version with 3D packing)
- Aesthetic anchors: Blackmagic Design DaVinci Resolve control surfaces, Linear app, Vercel dashboard, Polestar configurator
- Avoid: generic SaaS, Material Design, Bootstrap, purple gradients, rounded cards with drop shadows, emoji-heavy UX
