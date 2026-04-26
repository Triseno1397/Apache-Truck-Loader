-- Broaden the case library beyond live-event-production-specific gear:
-- general logistics (boxes, totes, tools, drums, generators), music
-- touring (cabs, drum hw, keyboards), and broadly-used AV (TVs,
-- projectors, lens cases, sandbags). Idempotent via the unique-on-label
-- index on global rows.

insert into public.case_library
  (label, depth_in, width_in, height_in, weight_lb, stackable, max_stack, is_global)
values
  -- General logistics: boxes
  ('Moving box (small)',              16, 12, 12,  12, true,  5, true),
  ('Moving box (medium)',             18, 18, 16,  18, true,  5, true),
  ('Moving box (large)',              24, 18, 18,  25, true,  4, true),
  ('Moving box (extra large)',        24, 20, 24,  35, true,  3, true),
  ('Wardrobe box',                    24, 21, 46,  30, true,  3, true),
  ('Banker box (file storage)',       15, 12, 10,   8, true,  6, true),
  -- Totes / crates
  ('Plastic tote (27-gal)',           30, 20, 14,  25, true,  4, true),
  ('Plastic milk crate',              13, 13, 11,  10, true,  8, true),
  -- Tools / industrial
  ('Tool chest (small)',              20, 10, 10,  25, true,  3, true),
  ('Tool chest (medium)',             30, 20, 20,  85, true,  2, true),
  ('5-gallon bucket',                 12, 12, 15,  25, true,  6, true),
  ('55-gallon drum',                  24, 24, 35, 100, false, 1, true),
  -- Power / outdoor
  ('Generator (small)',               24, 18, 18,  80, false, 1, true),
  ('Generator (medium)',              28, 22, 22, 150, false, 1, true),
  ('Cooler (large)',                  30, 20, 18,  30, true,  3, true),
  -- Music touring
  ('Guitar hard case',                44, 18,  6,  18, true,  4, true),
  ('Guitar combo amp case',           24, 16, 20,  45, true,  3, true),
  ('Bass cab 4x10 case',              28, 24, 28,  90, true,  2, true),
  ('Bass cab 8x10 case',              30, 24, 48, 130, false, 1, true),
  ('Drum hardware case',              32, 18, 14,  60, true,  3, true),
  ('Cymbal case',                     24, 24,  6,  30, true,  5, true),
  ('Keyboard case (61-key)',          40, 16,  8,  25, true,  4, true),
  ('Keyboard case (88-key)',          54, 18, 10,  45, true,  3, true),
  -- Photo / video extras
  ('Lens case',                       20, 14, 10,  12, true,  5, true),
  ('C-stand case',                    50, 10, 10,  60, true,  3, true),
  ('Sandbag (single, 25 lb)',         14,  8,  4,  25, true,  8, true),
  -- Catering / event tables
  ('Round table 60in (stack of 4)',   66, 60, 18, 120, false, 1, true),
  ('Folding table 8ft (stack of 4)',  96, 30, 18, 100, false, 1, true),
  -- Broad AV
  ('Flat panel TV case (50in)',       54, 36, 10,  60, true,  2, true),
  ('Projector flight case',           24, 18, 14,  45, true,  3, true)
on conflict do nothing;
