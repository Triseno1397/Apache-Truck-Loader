-- Add more global case presets to broaden the "Pieces + case" dropdown.
-- Apply via Supabase SQL editor in one paste (same flow as 0001).
-- The unique-on-label-where-global index makes this idempotent.

insert into public.case_library
  (label, depth_in, width_in, height_in, weight_lb, stackable, max_stack, is_global)
values
  -- Pelican (smaller)
  ('Pelican 1300',                  19, 13,  8,   6,  true,  8, true),
  ('Pelican 1400',                  17, 11,  6,   4,  true, 10, true),
  ('Pelican 1500',                  22, 16,  9,  11,  true,  6, true),
  ('Pelican 1550',                  22, 17, 10,  13,  true,  6, true),
  -- Pelican (medium / large)
  ('Pelican 1600',                  28, 21, 12,  28,  true,  5, true),
  ('Pelican 1660',                  33, 25, 16,  50,  true,  3, true),
  ('Pelican 1700 (rifle)',          37, 17,  6,  25,  true,  4, true),
  ('Pelican 1750 (long rifle)',     53, 16,  6,  30,  true,  3, true),
  -- SKB shock racks (more sizes)
  ('SKB 2U Shock Rack',             24, 22,  9,  25,  true,  6, true),
  ('SKB 8U Shock Rack',             28, 24, 18,  75,  true,  3, true),
  ('SKB 12U Shock Rack',            30, 26, 22, 100,  true,  2, true),
  -- Lighting
  ('Moving light case (1-fixture)', 24, 18, 24,  80,  true,  2, true),
  ('Moving light case (2-fixture)', 36, 28, 32, 150,  true,  2, true),
  ('LED par case (12-fixture)',     36, 26, 14,  90,  true,  3, true),
  ('Conventional par bag',          30, 22, 14,  50,  true,  3, true),
  ('Hazer / fogger case',           26, 22, 18,  35,  true,  3, true),
  -- Audio / mics / cables
  ('Microphone case (16-cap)',      24, 18, 12,  25,  true,  4, true),
  ('Snake case (50ft)',             36, 22, 16,  50,  true,  3, true),
  ('Speaker stands case (4-cap)',   48, 12, 12,  30,  true,  3, true),
  -- Stage hardware
  ('Stage deck (4x4)',              48, 48,  8,  90,  true,  8, true),
  ('Truss section 5ft',             60, 18, 18,  35,  true,  4, true),
  ('Truss section 10ft',           120, 18, 18,  65,  true,  4, true),
  ('Pipe and drape kit',            60, 24, 18,  80,  true,  3, true),
  -- Power / cables
  ('AC distro box (small)',         30, 24, 18,  60,  true,  2, true),
  ('Cable ramp case',               48, 14, 12,  40,  true,  4, true),
  -- Misc
  ('Gaff tape / consumables case',  22, 16, 14,  40,  true,  5, true),
  ('Folding chair stack (10-cap)',  36, 18, 18,  50,  false, 1, true)
on conflict do nothing;
