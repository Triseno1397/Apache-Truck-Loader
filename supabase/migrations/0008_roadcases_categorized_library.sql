-- Replace the global case-library presets with a categorized set modeled on
-- roadcases.com (the vendor the crew actually buys from). Adds a `category`
-- column and groups the dropdown into 5 sections: flat-screen displays,
-- trunk/utility, audio-video, work boxes (drawer cases), and rack cases.
--
-- Existing org-specific cases (is_global=false) are left alone; their
-- category stays null and they render outside the grouped sections.
-- Existing global presets are wiped and replaced — vendors that referenced
-- a deleted preset will fall back to the zero-dim placeholder
-- (lib/vendor-input.ts handles this) so the user can re-pick.

-- 1) New column. Nullable so org-specific cases don't have to declare one.
alter table public.case_library
  add column if not exists category text;

-- Constrain global presets to the 5 known categories. Org cases stay free.
alter table public.case_library
  drop constraint if exists case_library_category_valid;

alter table public.case_library
  add constraint case_library_category_valid
  check (
    category is null
    or category in (
      'flat_screen',
      'trunk_utility',
      'audio_video',
      'work_box',
      'rack'
    )
  );

create index if not exists case_library_category_idx
  on public.case_library (category) where category is not null;

-- 2) Wipe existing global presets — we're remaking the list from
-- roadcases.com. Org cases (is_global=false) are preserved.
delete from public.case_library where is_global = true;

-- 3) Seed the new categorized presets. Outside (exterior) dimensions only,
-- in inches: depth = length-of-truck axis, width = across truck, height
-- = vertical. Weights are reasonable estimates for ATA-style construction
-- since roadcases.com doesn't publish empty-case weights.
insert into public.case_library
  (label, depth_in, width_in, height_in, weight_lb, stackable, max_stack, is_global, category)
values
  -- Flat-Screen Display Cases
  ('32" Flat Screen Case',         35, 11, 27,  50, true,  3, true, 'flat_screen'),
  ('42" Flat Screen Case',         45, 11, 31,  70, true,  2, true, 'flat_screen'),
  ('50" Flat Screen Case',         53, 11, 33,  85, true,  2, true, 'flat_screen'),
  ('60" Flat Screen Case',         63, 11, 39, 110, true,  2, true, 'flat_screen'),
  ('70" Flat Screen Case',         73, 11, 42, 135, true,  2, true, 'flat_screen'),

  -- Trunk & Utility Cases
  ('Accessory Trunk',              25, 17, 15,  35, true,  4, true, 'trunk_utility'),
  ('Bully Supply Trunk',           33, 17, 24,  55, true,  3, true, 'trunk_utility'),
  ('Half-Pack Cable Trunk',        44, 22, 17,  75, true,  3, true, 'trunk_utility'),
  ('Full-Caddy Cable Trunk',       48, 30, 30, 130, true,  2, true, 'trunk_utility'),
  ('Single-Sided Wardrobe Trunk',  25, 26, 54, 110, false, 1, true, 'trunk_utility'),

  -- Audio-Video Cases
  ('6-Mic Case',                   12, 10, 13,  12, true,  5, true, 'audio_video'),
  ('12-Mic Case',                  18, 10, 13,  18, true,  5, true, 'audio_video'),
  ('Mixer / Rack Combo Case',      20, 28, 15,  55, true,  3, true, 'audio_video'),
  ('Medium Projector Case',        25, 25, 13,  25, true,  3, true, 'audio_video'),
  ('Large Projector Case',         33, 25, 19,  50, true,  2, true, 'audio_video'),

  -- Work Boxes (Drawer Cases)
  ('Small 4-Drawer Work Box',      19, 20, 44,  95, true,  2, true, 'work_box'),
  ('4-Drawer Workstation',         21, 24, 36, 110, true,  2, true, 'work_box'),
  ('Large 4-Drawer Work Box',      23, 23, 57, 145, true,  1, true, 'work_box'),
  ('5-Drawer Work Box',            24, 24, 46, 165, true,  1, true, 'work_box'),
  ('8 Tub-Drawer Work Box',        17, 22, 51, 120, true,  1, true, 'work_box'),

  -- Rack Cases
  ('4U 12" Effects Rack',          22, 16, 12,  35, true,  5, true, 'rack'),
  ('4U 16" Amp Rack',              22, 20, 12,  40, true,  5, true, 'rack'),
  ('6U 16" Amp Rack',              22, 20, 16,  50, true,  4, true, 'rack'),
  ('8U 16" Amp Rack',              22, 20, 19,  60, true,  3, true, 'rack'),
  ('12U 16" Amp Rack',             22, 20, 26,  80, true,  2, true, 'rack')
on conflict do nothing;
