-- Promote Pelican cases to their own top-level category in the picker.
-- Adds 'pelican' to the category check constraint and reassigns existing
-- Pelican rows out of audio_video.

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
      'rack',
      'pelican'
    )
  );

update public.case_library
  set category = 'pelican'
  where is_global = true
    and category = 'audio_video'
    and label ilike 'Pelican%';
