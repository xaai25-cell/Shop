-- Optional demo data. Run after 0001_init.sql.
-- Product images are uploaded from the admin panel (they are compressed to WebP automatically).

insert into public.categories (name, slug, description, color, sort_order) values
  ('Clothing',    'clothing',    'Everyday tees, shirts and dresses', '#ec4899', 1),
  ('Shoes',       'shoes',       'Sneakers, sandals and more',        '#f97316', 2),
  ('Accessories', 'accessories', 'Bags, caps and jewellery',          '#8b5cf6', 3),
  ('Home',        'home',        'Decor and living essentials',       '#10b981', 4),
  ('Electronics', 'electronics', 'Gadgets and accessories',           '#0ea5e9', 5)
on conflict (slug) do nothing;

with p as (
  insert into public.products (name, slug, description, category_id, base_price, compare_at_price, is_featured)
  values
    ('Island Breeze Tee', 'island-breeze-tee', 'Soft breathable cotton tee made for warm days.',
      (select id from public.categories where slug = 'clothing'), 249, 299, true),
    ('Lagoon Runner Sneakers', 'lagoon-runner-sneakers', 'Lightweight everyday sneakers with cushioned sole.',
      (select id from public.categories where slug = 'shoes'), 899, null, true),
    ('Reef Canvas Tote', 'reef-canvas-tote', 'Durable canvas tote with inner pocket.',
      (select id from public.categories where slug = 'accessories'), 199, 249, false)
  on conflict (slug) do nothing
  returning id, slug
)
insert into public.product_variants (product_id, sku, color, color_hex, size, stock, sort_order)
select p.id, v.sku, v.color, v.hex, v.size, v.stock, v.ord
from p
join (values
  ('island-breeze-tee', 'IBT-CORAL-S', 'Coral', '#ff6b6b', 'S', 12, 1),
  ('island-breeze-tee', 'IBT-CORAL-M', 'Coral', '#ff6b6b', 'M', 8, 2),
  ('island-breeze-tee', 'IBT-OCEAN-M', 'Ocean', '#0ea5e9', 'M', 10, 3),
  ('island-breeze-tee', 'IBT-OCEAN-L', 'Ocean', '#0ea5e9', 'L', 3, 4),
  ('lagoon-runner-sneakers', 'LRS-WHT-41', 'White', '#f8fafc', '41', 5, 1),
  ('lagoon-runner-sneakers', 'LRS-WHT-42', 'White', '#f8fafc', '42', 6, 2),
  ('lagoon-runner-sneakers', 'LRS-BLK-42', 'Black', '#111827', '42', 4, 3),
  ('reef-canvas-tote', 'RCT-SAND', 'Sand', '#e7d3a8', null, 20, 1),
  ('reef-canvas-tote', 'RCT-TEAL', 'Teal', '#14b8a6', null, 15, 2)
) as v(slug, sku, color, hex, size, stock, ord) on v.slug = p.slug;
