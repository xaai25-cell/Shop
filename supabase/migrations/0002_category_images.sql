-- Category cover images for the "Shop by category" tiles.
-- Safe to run more than once.

alter table public.categories add column if not exists image_path text
  check (image_path is null or char_length(image_path) <= 500);

-- Free demo photos (Unsplash License). Only fills categories that don't have an image yet.
update public.categories c
   set image_path = v.url
  from (values
    ('clothing',    'https://images.unsplash.com/photo-1540221652346-e5dd6b50f3e7?auto=format&fit=crop&w=1200&q=80'),
    ('shoes',       'https://images.unsplash.com/photo-1462927114214-6956d2fddd4e?auto=format&fit=crop&w=1200&q=80'),
    ('accessories', 'https://images.unsplash.com/photo-1760446031500-dfc64a62dd9b?auto=format&fit=crop&w=1200&q=80'),
    ('home',        'https://images.unsplash.com/photo-1554995207-c18c203602cb?auto=format&fit=crop&w=1200&q=80'),
    ('electronics', 'https://images.unsplash.com/photo-1571126817476-92bf7da319c3?auto=format&fit=crop&w=1200&q=80'),
    ('beauty',      'https://images.unsplash.com/photo-1602558618194-3037081afe0d?auto=format&fit=crop&w=1200&q=80')
  ) as v(slug, url)
 where c.slug = v.slug and c.image_path is null;
