-- Add Pelican protective cases back. The crew uses these constantly for
-- camera bodies, lenses, audio recorders, mics, comm gear — so they go
-- under the Audio-Video Cases dropdown. Six classic sizes from carry-on
-- (1510) to large transport (1650).
--
-- Idempotent: the unique-on-label-where-global index makes re-runs a no-op.

insert into public.case_library
  (label, depth_in, width_in, height_in, weight_lb, stackable, max_stack, is_global, category)
values
  ('Pelican 1510 (carry-on)', 22, 14,  9, 14, true, 6, true, 'audio_video'),
  ('Pelican 1550',            22, 17, 10, 13, true, 6, true, 'audio_video'),
  ('Pelican 1600',            28, 21, 12, 28, true, 5, true, 'audio_video'),
  ('Pelican 1610',            25, 20, 12, 22, true, 5, true, 'audio_video'),
  ('Pelican 1620',            28, 21, 13, 30, true, 5, true, 'audio_video'),
  ('Pelican 1650',            32, 21, 14, 35, true, 4, true, 'audio_video')
on conflict do nothing;
