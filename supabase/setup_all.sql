-- ONE-STEP SETUP: creates all tables, security rules and storage, then loads the demo catalog.
-- Paste this whole file into Supabase → SQL Editor → New query → Run. Safe to run more than once.

-- =====================================================================
--  Online Store – initial schema
--  Run in Supabase SQL editor (or `supabase db push`).
--  Safe defaults: RLS on every table, orders writable only through
--  SECURITY DEFINER functions, receipts in a PRIVATE bucket.
-- =====================================================================

create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------
do $$ begin
  create type public.order_status as enum
    ('pending', 'slip_uploaded', 'approved', 'delivered', 'rejected');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- Profiles / roles
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text,
  role        text not null default 'customer' check (role in ('customer', 'admin')),
  created_at  timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

-- ---------------------------------------------------------------------
-- Catalog
-- ---------------------------------------------------------------------
create table if not exists public.categories (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(name) between 1 and 80),
  slug         text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  description  text check (char_length(description) <= 500),
  color        text not null default '#6366f1' check (color ~ '^#[0-9a-fA-F]{6}$'),
  sort_order   int  not null default 0,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);

alter table public.categories add column if not exists image_path text
  check (image_path is null or char_length(image_path) <= 500);

create table if not exists public.products (
  id                uuid primary key default gen_random_uuid(),
  name              text not null check (char_length(name) between 1 and 160),
  slug              text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  description       text check (char_length(description) <= 5000),
  category_id       uuid references public.categories (id) on delete set null,
  base_price        numeric(12,2) not null check (base_price >= 0),
  compare_at_price  numeric(12,2) check (compare_at_price is null or compare_at_price >= 0),
  is_active         boolean not null default true,
  is_featured       boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists products_category_idx on public.products (category_id);
create index if not exists products_name_trgm on public.products using gin (name gin_trgm_ops);
create index if not exists products_active_created_idx on public.products (is_active, created_at desc);

create table if not exists public.product_images (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products (id) on delete cascade,
  path        text not null,
  alt         text check (char_length(alt) <= 200),
  color       text check (char_length(color) <= 40),   -- optional: links image to a variant colour
  width       int,
  height      int,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists product_images_product_idx on public.product_images (product_id, sort_order);

create table if not exists public.product_variants (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products (id) on delete cascade,
  sku         text unique check (char_length(sku) <= 64),
  color       text check (char_length(color) <= 40),
  color_hex   text check (color_hex is null or color_hex ~ '^#[0-9a-fA-F]{6}$'),
  size        text check (char_length(size) <= 20),
  price       numeric(12,2) check (price is null or price >= 0),   -- null = use product base price
  stock       int not null default 0 check (stock >= 0),
  is_active   boolean not null default true,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists product_variants_product_idx on public.product_variants (product_id);

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists products_touch on public.products;
create trigger products_touch before update on public.products
  for each row execute function public.touch_updated_at();

-- Listing view used by the storefront (respects RLS of base tables)
create or replace view public.product_listing
with (security_invoker = true) as
select
  p.id, p.name, p.slug, p.description, p.base_price, p.compare_at_price,
  p.is_active, p.is_featured, p.created_at, p.category_id,
  c.slug  as category_slug,
  c.name  as category_name,
  coalesce(min(coalesce(v.price, p.base_price)) filter (where v.is_active), p.base_price) as min_price,
  coalesce(max(coalesce(v.price, p.base_price)) filter (where v.is_active), p.base_price) as max_price,
  coalesce(sum(v.stock) filter (where v.is_active), 0)::int as total_stock,
  coalesce(array_agg(distinct v.color) filter (where v.color is not null and v.is_active), '{}') as colors,
  coalesce(array_agg(distinct v.size)  filter (where v.size  is not null and v.is_active), '{}') as sizes,
  (select jsonb_agg(jsonb_build_object('color', x.color, 'hex', x.color_hex))
     from (select distinct v2.color, v2.color_hex from public.product_variants v2
           where v2.product_id = p.id and v2.is_active and v2.color_hex is not null) x) as swatches,
  (select array_agg(i.path order by i.sort_order, i.created_at)
     from (select * from public.product_images i0 where i0.product_id = p.id
           order by i0.sort_order, i0.created_at limit 2) i) as image_paths
from public.products p
left join public.categories c on c.id = p.category_id
left join public.product_variants v on v.product_id = p.id
group by p.id, c.slug, c.name;

-- ---------------------------------------------------------------------
-- Orders
-- ---------------------------------------------------------------------
create table if not exists public.orders (
  id                  uuid primary key default gen_random_uuid(),
  order_number        text not null unique,
  customer_name       text not null check (char_length(customer_name) between 2 and 120),
  phone               text not null check (phone ~ '^\+?[0-9]{7,15}$'),
  email               text check (email is null or char_length(email) <= 200),
  address             text not null check (char_length(address) between 3 and 300),
  island              text not null check (char_length(island) between 2 and 80),
  notes               text check (char_length(notes) <= 500),
  subtotal            numeric(12,2) not null check (subtotal >= 0),
  delivery_fee        numeric(12,2) not null default 0 check (delivery_fee >= 0),
  total               numeric(12,2) not null check (total >= 0),
  status              public.order_status not null default 'pending',
  receipt_path        text,
  receipt_uploaded_at timestamptz,
  admin_note          text check (char_length(admin_note) <= 1000),
  rejection_reason    text check (char_length(rejection_reason) <= 500),
  stock_restored      boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists orders_status_created_idx on public.orders (status, created_at desc);
create index if not exists orders_created_idx on public.orders (created_at desc);
create index if not exists orders_phone_idx on public.orders (phone);

drop trigger if exists orders_touch on public.orders;
create trigger orders_touch before update on public.orders
  for each row execute function public.touch_updated_at();

create table if not exists public.order_items (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references public.orders (id) on delete cascade,
  product_id     uuid references public.products (id) on delete set null,
  variant_id     uuid references public.product_variants (id) on delete set null,
  product_name   text not null,
  variant_label  text,
  image_path     text,
  unit_price     numeric(12,2) not null check (unit_price >= 0),
  quantity       int not null check (quantity between 1 and 100),
  line_total     numeric(12,2) not null check (line_total >= 0)
);
create index if not exists order_items_order_idx on public.order_items (order_id);
create index if not exists order_items_product_idx on public.order_items (product_id);

create table if not exists public.order_status_history (
  id           bigint generated always as identity primary key,
  order_id     uuid not null references public.orders (id) on delete cascade,
  from_status  public.order_status,
  to_status    public.order_status not null,
  note         text,
  changed_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists order_history_order_idx on public.order_status_history (order_id, created_at);

-- Simple fixed-window rate limiter (server-side only)
create table if not exists public.rate_limits (
  key           text not null,
  window_start  timestamptz not null,
  count         int not null default 0,
  primary key (key, window_start)
);

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.profiles             enable row level security;
alter table public.categories           enable row level security;
alter table public.products             enable row level security;
alter table public.product_images       enable row level security;
alter table public.product_variants     enable row level security;
alter table public.orders               enable row level security;
alter table public.order_items          enable row level security;
alter table public.order_status_history enable row level security;
alter table public.rate_limits          enable row level security;

-- profiles: users read their own row, admins read all. NO client updates (prevents role escalation).
drop policy if exists "profiles self read" on public.profiles;
create policy "profiles self read" on public.profiles
  for select to authenticated using (id = (select auth.uid()) or (select public.is_admin()));

-- catalog: public reads active rows, admins full access
drop policy if exists "categories public read" on public.categories;
create policy "categories public read" on public.categories
  for select using (is_active or (select public.is_admin()));
drop policy if exists "categories admin write" on public.categories;
create policy "categories admin write" on public.categories
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists "products public read" on public.products;
create policy "products public read" on public.products
  for select using (is_active or (select public.is_admin()));
drop policy if exists "products admin write" on public.products;
create policy "products admin write" on public.products
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists "images public read" on public.product_images;
create policy "images public read" on public.product_images
  for select using (exists (select 1 from public.products p where p.id = product_id and (p.is_active or (select public.is_admin()))));
drop policy if exists "images admin write" on public.product_images;
create policy "images admin write" on public.product_images
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists "variants public read" on public.product_variants;
create policy "variants public read" on public.product_variants
  for select using (exists (select 1 from public.products p where p.id = product_id and (p.is_active or (select public.is_admin()))));
drop policy if exists "variants admin write" on public.product_variants;
create policy "variants admin write" on public.product_variants
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- orders: admins can read. All writes go through SECURITY DEFINER functions below.
drop policy if exists "orders admin read" on public.orders;
create policy "orders admin read" on public.orders
  for select to authenticated using ((select public.is_admin()));
drop policy if exists "orders admin note" on public.orders;
create policy "orders admin note" on public.orders
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists "order items admin read" on public.order_items;
create policy "order items admin read" on public.order_items
  for select to authenticated using ((select public.is_admin()));

drop policy if exists "order history admin read" on public.order_status_history;
create policy "order history admin read" on public.order_status_history
  for select to authenticated using ((select public.is_admin()));
-- rate_limits: no policies => only service_role can touch it.

-- Explicit Data API grants (RLS still decides which rows are visible)
grant usage on schema public to anon, authenticated, service_role;
grant select on public.categories, public.products, public.product_images,
                public.product_variants, public.product_listing to anon, authenticated;
grant insert, update, delete on public.categories, public.products, public.product_images,
                public.product_variants to authenticated;
grant select on public.orders, public.order_items, public.order_status_history, public.profiles to authenticated;
grant all on all tables in schema public to service_role;
revoke insert, update, delete, truncate on public.categories, public.products, public.product_images,
                public.product_variants, public.profiles from anon;
revoke update, insert, delete on public.profiles from authenticated;  -- roles can't be self-assigned

-- Column-level hardening: admins may only edit the note directly; status changes go through set_order_status()
revoke insert, update, delete on public.orders from anon, authenticated;
revoke insert, update, delete on public.order_items, public.order_status_history from anon, authenticated;
revoke all on public.rate_limits from anon, authenticated;
grant update (admin_note) on public.orders to authenticated;

-- ---------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------

-- Rate limiter – returns true if the call is allowed.
create or replace function public.check_rate_limit(p_key text, p_limit int, p_window_seconds int)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_count int;
begin
  insert into public.rate_limits as r (key, window_start, count)
  values (p_key, v_window, 1)
  on conflict (key, window_start) do update set count = r.count + 1
  returning r.count into v_count;

  -- opportunistic cleanup
  if random() < 0.02 then
    delete from public.rate_limits where window_start < now() - interval '1 day';
  end if;

  return v_count <= p_limit;
end $$;

-- Atomically create an order: validates stock, locks variant rows, uses DB prices.
-- p_items: [{ "variant_id": uuid, "quantity": int }]
create or replace function public.place_order(
  p_customer jsonb,
  p_items jsonb,
  p_delivery_fee numeric
)
returns table (order_id uuid, order_number text, total numeric)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_order_id   uuid := gen_random_uuid();
  v_number     text;
  v_subtotal   numeric(12,2) := 0;
  v_item       record;
  v_row        record;
  v_count      int;
begin
  select count(*) into v_count from jsonb_array_elements(p_items);
  if v_count = 0 or v_count > 50 then
    raise exception 'INVALID_CART';
  end if;

  v_number := 'ORD-' || to_char(now() at time zone 'Indian/Maldives', 'YYMMDD') || '-' ||
              upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  insert into public.orders (id, order_number, customer_name, phone, email, address, island, notes,
                             subtotal, delivery_fee, total, status)
  values (v_order_id, v_number,
          p_customer ->> 'customer_name', p_customer ->> 'phone', nullif(p_customer ->> 'email', ''),
          p_customer ->> 'address', p_customer ->> 'island', nullif(p_customer ->> 'notes', ''),
          0, p_delivery_fee, 0, 'pending');

  -- aggregate duplicates & lock rows in a stable order to avoid deadlocks
  for v_item in
    select (e ->> 'variant_id')::uuid as variant_id, sum((e ->> 'quantity')::int) as qty
    from jsonb_array_elements(p_items) e
    group by 1 order by 1
  loop
    if v_item.qty < 1 or v_item.qty > 100 then
      raise exception 'INVALID_QUANTITY';
    end if;

    select v.id, v.stock, v.color, v.size, coalesce(v.price, p.base_price) as unit_price,
           p.id as product_id, p.name as product_name,
           (select i.path from public.product_images i where i.product_id = p.id
             order by (i.color is not distinct from v.color) desc, i.sort_order limit 1) as image_path
      into v_row
      from public.product_variants v
      join public.products p on p.id = v.product_id
     where v.id = v_item.variant_id and v.is_active and p.is_active
     for update of v;

    if not found then
      raise exception 'ITEM_UNAVAILABLE';
    end if;
    if v_row.stock < v_item.qty then
      raise exception 'INSUFFICIENT_STOCK:%', v_row.product_name;
    end if;

    update public.product_variants set stock = stock - v_item.qty where id = v_row.id;

    insert into public.order_items (order_id, product_id, variant_id, product_name, variant_label,
                                    image_path, unit_price, quantity, line_total)
    values (v_order_id, v_row.product_id, v_row.id, v_row.product_name,
            nullif(concat_ws(' / ', v_row.color, v_row.size), ''),
            v_row.image_path, v_row.unit_price, v_item.qty, v_row.unit_price * v_item.qty);

    v_subtotal := v_subtotal + v_row.unit_price * v_item.qty;
  end loop;

  update public.orders o
     set subtotal = v_subtotal, total = v_subtotal + p_delivery_fee
   where o.id = v_order_id;

  insert into public.order_status_history (order_id, from_status, to_status, note)
  values (v_order_id, null, 'pending', 'Order placed');

  return query select v_order_id, v_number, v_subtotal + p_delivery_fee;
end $$;

-- Customer attaches a payment slip (called by the server with the service role)
create or replace function public.attach_receipt(p_order_id uuid, p_path text)
returns text  -- returns the previous receipt path (so the server can delete it)
language plpgsql security definer set search_path = '' as $$
declare
  v_status public.order_status;
  v_old    text;
begin
  select status, receipt_path into v_status, v_old from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_status not in ('pending', 'slip_uploaded') then
    raise exception 'ORDER_LOCKED';
  end if;

  update public.orders
     set receipt_path = p_path, receipt_uploaded_at = now(), status = 'slip_uploaded',
         rejection_reason = null
   where id = p_order_id;

  insert into public.order_status_history (order_id, from_status, to_status, note)
  values (p_order_id, v_status, 'slip_uploaded',
          case when v_old is null then 'Payment slip uploaded' else 'Payment slip replaced' end);
  return v_old;
end $$;

-- Admin status change with enforced transitions and stock restore on rejection.
create or replace function public.set_order_status(p_order_id uuid, p_status public.order_status, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_current public.order_status;
  v_restored boolean;
  v_allowed boolean;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN';
  end if;

  select status, stock_restored into v_current, v_restored
    from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;

  v_allowed := case v_current
    when 'pending'       then p_status in ('approved', 'rejected')
    when 'slip_uploaded' then p_status in ('approved', 'rejected', 'pending')   -- pending = ask for a new slip
    when 'approved'      then p_status in ('delivered', 'rejected')
    else false
  end;
  if not v_allowed then
    raise exception 'INVALID_TRANSITION';
  end if;

  if p_status = 'rejected' and not v_restored then
    update public.product_variants v
       set stock = v.stock + oi.quantity
      from public.order_items oi
     where oi.order_id = p_order_id and oi.variant_id = v.id;
    update public.orders set stock_restored = true where id = p_order_id;
  end if;

  update public.orders
     set status = p_status,
         rejection_reason = case when p_status in ('rejected', 'pending') then left(p_note, 500) else rejection_reason end
   where id = p_order_id;

  insert into public.order_status_history (order_id, from_status, to_status, note, changed_by)
  values (p_order_id, v_current, p_status, left(p_note, 500), auth.uid());
end $$;

-- Dashboard statistics (admin only)
create or replace function public.admin_stats(p_days int default 30)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v jsonb;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;

  select jsonb_build_object(
    'revenue_total', coalesce((select sum(total) from public.orders where status in ('approved','delivered')), 0),
    'revenue_period', coalesce((select sum(total) from public.orders
                                 where status in ('approved','delivered') and created_at >= now() - make_interval(days => p_days)), 0),
    'orders_total', (select count(*) from public.orders),
    'orders_period', (select count(*) from public.orders where created_at >= now() - make_interval(days => p_days)),
    'avg_order_value', coalesce((select round(avg(total), 2) from public.orders where status in ('approved','delivered')), 0),
    'by_status', coalesce((select jsonb_object_agg(status, n) from
                   (select status, count(*) n from public.orders group by status) s), '{}'::jsonb),
    'products_total', (select count(*) from public.products),
    'products_active', (select count(*) from public.products where is_active),
    'low_stock', coalesce((select jsonb_agg(x) from (
        select v.id, p.id as product_id, p.name, concat_ws(' / ', v.color, v.size) as label, v.stock
          from public.product_variants v join public.products p on p.id = v.product_id
         where v.is_active and v.stock <= 5
         order by v.stock asc, p.name limit 10) x), '[]'::jsonb),
    'top_products', coalesce((select jsonb_agg(x) from (
        select oi.product_name as name, sum(oi.quantity)::int as qty, sum(oi.line_total) as revenue
          from public.order_items oi join public.orders o on o.id = oi.order_id
         where o.status in ('approved','delivered')
         group by oi.product_name order by sum(oi.quantity) desc limit 5) x), '[]'::jsonb),
    'daily', coalesce((select jsonb_agg(x order by x.day) from (
        select d::date as day,
               coalesce(sum(o.total) filter (where o.status in ('approved','delivered')), 0) as revenue,
               count(o.id) as orders
          from generate_series((now() at time zone 'Indian/Maldives')::date - (p_days - 1),
                               (now() at time zone 'Indian/Maldives')::date, interval '1 day') d
          left join public.orders o on (o.created_at at time zone 'Indian/Maldives')::date = d::date
         group by d) x), '[]'::jsonb)
  ) into v;
  return v;
end $$;

-- Lock down function execution
revoke execute on function public.check_rate_limit(text, int, int) from public, anon, authenticated;
revoke execute on function public.place_order(jsonb, jsonb, numeric) from public, anon, authenticated;
revoke execute on function public.attach_receipt(uuid, text) from public, anon, authenticated;
grant  execute on function public.check_rate_limit(text, int, int) to service_role;
grant  execute on function public.place_order(jsonb, jsonb, numeric) to service_role;
grant  execute on function public.attach_receipt(uuid, text) to service_role;

revoke execute on function public.set_order_status(uuid, public.order_status, text) from public, anon;
revoke execute on function public.admin_stats(int) from public, anon;
grant  execute on function public.set_order_status(uuid, public.order_status, text) to authenticated;
grant  execute on function public.admin_stats(int) to authenticated;

-- ---------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 3145728, array['image/webp'])
on conflict (id) do update set public = true, file_size_limit = 3145728, allowed_mime_types = array['image/webp'];

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 2097152, array['image/webp'])
on conflict (id) do update set public = false, file_size_limit = 2097152, allowed_mime_types = array['image/webp'];

drop policy if exists "product images admin insert" on storage.objects;
create policy "product images admin insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'product-images' and (select public.is_admin()));
drop policy if exists "product images admin update" on storage.objects;
create policy "product images admin update" on storage.objects
  for update to authenticated using (bucket_id = 'product-images' and (select public.is_admin()));
drop policy if exists "product images admin delete" on storage.objects;
create policy "product images admin delete" on storage.objects
  for delete to authenticated using (bucket_id = 'product-images' and (select public.is_admin()));

-- Receipts: only admins can read (via signed URLs). Uploads happen server-side with the service role.
drop policy if exists "receipts admin read" on storage.objects;
create policy "receipts admin read" on storage.objects
  for select to authenticated using (bucket_id = 'receipts' and (select public.is_admin()));

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

-- ===================== DEMO DATA =====================
-- Demo catalog: 6 categories, 26 products with variants and free Unsplash photos.
-- Photos: Unsplash License (free for commercial use). Replace with your own product photos before launch.
-- Safe to re-run: existing demo products (matched by slug) are refreshed.

begin;

insert into public.categories (name, slug, description, color, sort_order) values
  ('Clothing', 'clothing', 'Everyday tees, shirts, dresses and layers', '#ec4899', 1),
  ('Shoes', 'shoes', 'Sneakers, sandals and boots', '#f97316', 2),
  ('Accessories', 'accessories', 'Bags, watches, eyewear and more', '#8b5cf6', 3),
  ('Home', 'home', 'Decor and living essentials', '#10b981', 4),
  ('Electronics', 'electronics', 'Audio, gadgets and desk gear', '#0ea5e9', 5),
  ('Beauty', 'beauty', 'Skincare and fragrance', '#f43f5e', 6)
on conflict (slug) do update set name = excluded.name, description = excluded.description, color = excluded.color, sort_order = excluded.sort_order;

-- Remove previous demo products so the script can be re-run (order history keeps product names).
delete from public.products where slug in ('island-breeze-tee', 'coastal-linen-shirt', 'sunset-summer-dress', 'cloud-fleece-hoodie', 'classic-denim-jacket', 'lagoon-runner-sneakers', 'pastel-court-sneakers', 'beach-slide-sandals', 'trailhead-leather-boots', 'reef-canvas-tote', 'urban-daypack', 'golden-hour-sunglasses', 'heritage-chronograph-watch', 'slim-leather-wallet', 'sunny-straw-hat', 'smart-fit-watch', 'morning-ceramic-mug', 'amber-glow-candle', 'cozy-throw-pillow', 'terracotta-plant-pot', 'nordic-table-lamp', 'wave-wireless-headphones', 'pocket-boom-speaker', 'clicky-mechanical-keyboard', 'glow-serum-set', 'ocean-mist-perfume');

-- Island Breeze Tee
insert into public.products (name, slug, description, category_id, base_price, compare_at_price, is_featured, created_at)
values ('Island Breeze Tee', 'island-breeze-tee', 'Soft, breathable 100% cotton crew-neck tee made for warm island days. Pre-shrunk with a relaxed fit.', (select id from public.categories where slug = 'clothing'), 249, 299, true, now() - interval '26 hours');
insert into public.product_variants (product_id, sku, color, color_hex, size, price, stock, sort_order)
select (select id from public.products where slug = 'island-breeze-tee'), v.sku, v.color, v.color_hex, v.size, v.price::numeric, v.stock, v.sort_order from (values
  ('IBT-WHITE-S', 'White', '#f8fafc', 'S', null, 10, 0),
  ('IBT-WHITE-M', 'White', '#f8fafc', 'M', null, 4, 1),
  ('IBT-WHITE-L', 'White', '#f8fafc', 'L', null, 12, 2),
  ('IBT-WHITE-XL', 'White', '#f8fafc', 'XL', 299, 0, 3),
  ('IBT-BLACK-S', 'Black', '#111827', 'S', null, 2, 4),
  ('IBT-BLACK-M', 'Black', '#111827', 'M', null, 20, 5),
  ('IBT-BLACK-L', 'Black', '#111827', 'L', null, 2, 6),
  ('IBT-BLACK-XL', 'Black', '#111827', 'XL', 299, 10, 7)
) as v(sku, color, color_hex, size, price, stock, sort_order);
insert into public.product_images (product_id, path, alt, color, sort_order)
select (select id from public.products where slug = 'island-breeze-tee'), v.path, v.alt, v.color::text, v.sort_order from (values
  ('https://images.unsplash.com/photo-1581655353564-df123a1eb820?auto=format&fit=crop&w=1200&q=80', 'Island Breeze Tee', 'White', 0),
  ('https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?auto=format&fit=crop&w=1200&q=80', 'Island Breeze Tee', 'Black', 1),
  ('https://images.unsplash.com/photo-1562157873-818bc0726f68?auto=format&fit=crop&w=1200&q=80', 'Island Breeze Tee', null, 2)
) as v(path, alt, color, sort_order);

-- Coastal Linen Shirt
insert into public.products (name, slug, description, category_id, base_price, compare_at_price, is_featured, created_at)
values ('Coastal Linen Shirt', 'coastal-linen-shirt', 'Lightweight linen-blend button-up that stays cool in the heat. Perfect for the office or a sunset dinner.', (select id from public.categories where slug = 'clothing'), 549, null, true, now() - interval '25 hours');
insert into public.product_variants (product_id, sku, color, color_hex, size, price, stock, sort_order)
select (select id from public.products where slug = 'coastal-linen-shirt'), v.sku, v.color, v.color_hex, v.size, v.price::numeric, v.stock, v.sort_order from (values
  ('CLS-SKYBLU-S', 'Sky Blue', '#7dd3fc', 'S', null, 25, 0),
  ('CLS-SKYBLU-M', 'Sky Blue', '#7dd3fc', 'M', null, 0, 1),
  ('CLS-SKYBLU-L', 'Sky Blue', '#7dd3fc', 'L', null, 20, 2),
  ('CLS-SKYBLU-XL', 'Sky Blue', '#7dd3fc', 'XL', 599, 6, 3),
  ('CLS-WHITE-S', 'White', '#f8fafc', 'S', null, 0, 4),
  ('CLS-WHITE-M', 'White', '#f8fafc', 'M', null, 2, 5),
  ('CLS-WHITE-L', 'White', '#f8fafc', 'L', null, 12, 6),
  ('CLS-WHITE-XL', 'White', '#f8fafc', 'XL', 599, 12, 7)
) as v(sku, color, color_hex, size, price, stock, sort_order);
insert into public.product_images (product_id, path, alt, color, sort_order)
select (select id from public.products where slug = 'coastal-linen-shirt'), v.path, v.alt, v.color::text, v.sort_order from (values
  ('https://images.unsplash.com/photo-1617117475026-2eb3e68b63cf?auto=format&fit=crop&w=1200&q=80', 'Coastal Linen Shirt', 'Sky Blue', 0),
  ('https://images.unsplash.com/photo-1740711152088-88a009e877bb?auto=format&fit=crop&w=1200&q=80', 'Coastal Linen Shirt', 'Sky Blue', 1),
  ('https://images.unsplash.com/photo-1591357037205-166318b51afd?auto=format&fit=crop&w=1200&q=80', 'Coastal Linen Shirt', 'White', 2)
) as v(path, alt, color, sort_order);

-- Sunset Summer Dress
insert into public.products (name, slug, description, category_id, base_price, compare_at_price, is_featured, created_at)
values ('Sunset Summer Dress', 'sunset-summer-dress', 'Flowy sleeveless midi dress with a flattering waist. Breezy fabric that moves with you.', (select id from public.categories where slug = 'clothing'), 699, 849, true, now() - interval '24 hours');
insert into public.product_variants (product_id, sku, color, color_hex, size, price, stock, sort_order)
select (select id from public.products where slug = 'sunset-summer-dress'), v.sku, v.color, v.color_hex, v.size, v.price::numeric, v.stock, v.sort_order from (values
  ('SSD-SUNFLO-S', 'Sunflower', '#facc15', 'S', null, 2, 0),
  ('SSD-SUNFLO-M', 'Sunflower', '#facc15', 'M', null, 6, 1),
  ('SSD-SUNFLO-L', 'Sunflower', '#facc15', 'L', null, 2, 2),
  ('SSD-OCEAN-S', 'Ocean', '#3b82f6', 'S', null, 20, 3),
  ('SSD-OCEAN-M', 'Ocean', '#3b82f6', 'M', null, 12, 4),
  ('SSD-OCEAN-L', 'Ocean', '#3b82f6', 'L', null, 0, 5)
) as v(sku, color, color_hex, size, price, stock, sort_order);
insert into public.product_images (product_id, path, alt, color, sort_order)
select (select id from public.products where slug = 'sunset-summer-dress'), v.path, v.alt, v.color::text, v.sort_order from (values
  ('https://images.unsplash.com/photo-1609695813802-3c443be34359?auto=format&fit=crop&w=1200&q=80', 'Sunset Summer Dress', 'Sunflower', 0),
  ('https://images.unsplash.com/photo-1613966570650-add3cf83aa83?auto=format&fit=crop&w=1200&q=80', 'Sunset Summer Dress', 'Ocean', 1),
  ('https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&w=1200&q=80', 'Sunset Summer Dress', null, 2)
) as v(path, alt, color, sort_order);

-- Cloud Fleece Hoodie
insert into public.products (name, slug, description, category_id, base_price, compare_at_price, is_featured, created_at)
values ('Cloud Fleece Hoodie', 'cloud-fleece-hoodie', 'Brushed fleece pullover hoodie with a roomy hood and kangaroo pocket. Ideal for air-conditioned evenings.', (select id from public.categories where slug = 'clothing'), 749, null, false, now() - interval '23 hours');
insert into public.product_variants (product_id, sku, color, color_hex, size, price, stock, sort_order)
select (select id from public.products where slug = 'cloud-fleece-hoodie'), v.sku, v.color, v.color_hex, v.size, v.price::numeric, v.stock, v.sort_order from (values
  ('CFH-GREY-S', 'Grey', '#9ca3af', 'S', null, 25, 0),
  ('CFH-GREY-M', 'Grey', '#9ca3af', 'M', null, 2, 1),
  ('CFH-GREY-L', 'Grey', '#9ca3af', 'L', null, 6, 2),
  ('CFH-GREY-XL', 'Grey', '#9ca3af', 'XL', 799, 25, 3),
  ('CFH-WHITE-S', 'White', '#f8fafc', 'S', null, 0, 4),
  ('CFH-WHITE-M', 'White', '#f8fafc', 'M', null, 25, 5),
  ('CFH-WHITE-L', 'White', '#f8fafc', 'L', null, 25, 6),
  ('CFH-WHITE-XL', 'White', '#f8fafc', 'XL', 799, 12, 7),
  ('CFH-BLACK-S', 'Black', '#111827', 'S', null, 0, 8),
  ('CFH-BLACK-M', 'Black', '#111827', 'M', null, 6, 9),
  ('CFH-BLACK-L', 'Black', '#111827', 'L', null, 0, 10),
  ('CFH-BLACK-XL', 'Black', '#111827', 'XL', 799, 20, 11)
) as v(sku, color, color_hex, size, price, stock, sort_order);
insert into public.product_images (product_id, path, alt, color, sort_order)
select (select id from public.products where slug = 'cloud-fleece-hoodie'), v.path, v.alt, v.color::text, v.sort_order from (values
  ('https://images.unsplash.com/photo-1556821840-3a63f95609a7?auto=format&fit=crop&w=1200&q=80', 'Cloud Fleece Hoodie', 'Grey', 0),
  ('https://images.unsplash.com/photo-1620799140188-3b2a02fd9a77?auto=format&fit=crop&w=1200&q=80', 'Cloud Fleece Hoodie', 'White', 1),
  ('https://images.unsplash.com/photo-1579572331145-5e53b299c64e?auto=format&fit=crop&w=1200&q=80', 'Cloud Fleece Hoodie', 'Black', 2)
) as v(path, alt, color, sort_order);

-- Classic Denim Jacket
insert into public.products (name, slug, description, category_id, base_price, compare_at_price, is_featured, created_at)
values ('Classic Denim Jacket', 'classic-denim-jacket', 'A timeless washed-denim jacket with button front and chest pockets. Gets better with every wear.', (select id from public.categories where slug = 'clothing'), 1199, 1399, false, now() - interval '22 hours');
insert into public.product_variants (product_id, sku, color, color_hex, size, price, stock, sort_order)
select (select id from public.products where slug = 'classic-denim-jacket'), v.sku, v.color, v.color_hex, v.size, v.price::numeric, v.stock, v.sort_order from (values
  ('CDJ-LIGHTW-S', 'Light Wash', '#93c5fd', 'S', null, 4, 0),
  ('CDJ-LIGHTW-M', 'Light Wash', '#93c5fd', 'M', null, 8, 1),
  ('CDJ-LIGHTW-L', 'Light Wash', '#93c5fd', 'L', null, 12, 2),
  ('CDJ-LIGHTW-XL', 'Light Wash', '#93c5fd', 'XL', 1299, 4, 3)
) as v(sku, color, color_hex, size, price, stock, sort_order);
insert into public.product_images (product_id, path, alt, color, sort_order)
select (select id from public.products where slug = 'classic-denim-jacket'), v.path, v.alt, v.color::text, v.sort_order from (values
  ('https://images.unsplash.com/photo-1611312449408-fcece27cdbb7?auto=format&fit=crop&w=1200&q=80', 'Classic Denim Jacket', null, 0),
  ('https://images.unsplash.com/photo-1543076447-215ad9ba6923?auto=format&fit=crop&w=1200&q=80', 'Classic Denim Jacket', null, 1),
  ('https://images.unsplash.com/photo-1555583743-991174c11425?auto=format&fit=crop&w=1200&q=80', 'Classic Denim Jacket', null, 2)
) as v(path, alt, color, sort_order);

-- Lagoon Runner Sneakers
insert into public.products (name, slug, description, category_id, base_price, compare_at_price, is_featured, created_at)
values ('Lagoon Runner Sneakers', 'lagoon-runner-sneakers', 'Lightweight everyday sneakers with a cushioned sole and breathable upper.', (select id from public.categories where slug = 'shoes'), 899, null, true, now() - interval '21 hours');
insert into public.product_variants (product_id, sku, color, color_hex, size, price, stock, sort_order)
select (select id from public.products where slug = 'lagoon-runner-sneakers'), v.sku, v.color, v.color_hex, v.size, v.price::numeric, v.stock, v.sort_order from (values
  ('LRS-WHITE-40', 'White', '#f8fafc', '40', null, 20, 0),
  ('LRS-WHITE-41', 'White', '#f8fafc', '41', null, 2, 1),
  ('LRS-WHITE-42', 'White', '#f8fafc', '42', null, 25, 2),
  ('LRS-WHITE-43', 'White', '#f8fafc', '43', null, 8, 3),
  ('LRS-WHITE-44', 'White', '#f8fafc', '44', 949, 20, 4),
  ('LRS-SUNSET-40', 'Sunset', '#fb923c', '40', null, 4, 5),
  ('LRS-SUNSET-41', 'Sunset', '#fb923c', '41', null, 2, 6),
  ('LRS-SUNSET-42', 'Sunset', '#fb923c', '42', null, 25, 7),
  ('LRS-SUNSET-43', 'Sunset', '#fb923c', '43', null, 25, 8),
  ('LRS-SUNSET-44', 'Sunset', '#fb923c', '44', 949, 6, 9)
) as v(sku, color, color_hex, size, price, stock, sort_order);
insert into public.product_images (product_id, path, alt, color, sort_order)
select (select id from public.products where slug = 'lagoon-runner-sneakers'), v.path, v.alt, v.color::text, v.sort_order from (values
  ('https://images.unsplash.com/photo-1600185365926-3a2ce3cdb9eb?auto=format&fit=crop&w=1200&q=80', 'Lagoon Runner Sneakers', 'Sunset', 0),
  ('https://images.unsplash.com/photo-1560769629-975ec94e6a86?auto=format&fit=crop&w=1200&q=80', 'Lagoon Runner Sneakers', 'Sunset', 1),
  ('https://images.unsplash.com/photo-1600269452121-4f2416e55c28?auto=format&fit=crop&w=1200&q=80', 'Lagoon Runner Sneakers', 'White', 2)
) as v(path, alt, color, sort_order);

-- Pastel Court Sneakers
insert into public.products (name, slug, description, category_id, base_price, compare_at_price, is_featured, created_at)
values ('Pastel Court Sneakers', 'pastel-court-sneakers', 'Playful low-top sneakers in candy pastel tones with comfy padded collars.', (select id from public.categories where slug = 'shoes'), 799, 949, false, now() - interval '20 hours');
insert into public.product_variants (product_id, sku, color, color_hex, size, price, stock, sort_order)
select (select id from public.products where slug = 'pastel-court-sneakers'), v.sku, v.color, v.color_hex, v.size, v.price::numeric, v.stock, v.sort_order from (values
  ('PCS-PASTEL-37', 'Pastel', '#c4b5fd', '37', null, 10, 0),
  ('PCS-PASTEL-38', 'Pastel', '#c4b5fd', '38', null, 2, 1),
  ('PCS-PASTEL-39', 'Pastel', '#c4b5fd', '39', null, 20, 2),
  ('PCS-PASTEL-40', 'Pastel', '#c4b5fd', '40', null, 2, 3),
  ('PCS-PASTEL-41', 'Pastel', '#c4b5fd', '41', null, 25, 4),
  ('PCS-MAROON-37', 'Maroon', '#9f1239', '37', null, 0, 5),
  ('PCS-MAROON-38', 'Maroon', '#9f1239', '38', null, 25, 6),
  ('PCS-MAROON-39', 'Maroon', '#9f1239', '39', null, 6, 7),
  ('PCS-MAROON-40', 'Maroon', '#9f1239', '40', null, 15, 8),
  ('PCS-MAROON-41', 'Maroon', '#9f1239', '41', null, 20, 9)
) as v(sku, color, color_hex, size, price, stock, sort_order);
insert into public.product_images (product_id, path, alt, color, sort_order)
select (select id from public.products where slug = 'pastel-court-sneakers'), v.path, v.alt, v.color::text, v.sort_order from (values
  ('https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?auto=format&fit=crop&w=1200&q=80', 'Pastel Court Sneakers', 'Pastel', 0),
  ('https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77?auto=format&fit=crop&w=1200&q=80', 'Pastel Court Sneakers', 'Maroon', 1)
) as v(path, alt, color, sort_order);

-- Beach Slide Sandals
insert into public.products (name, slug, description, category_id, base_price, compare_at_price, is_featured, created_at)
values ('Beach Slide Sandals', 'beach-slide-sandals', 'Easy slip-on sandals with a contoured footbed. Made for the beach, the boat and everything between.', (select id from public.categories where slug = 'shoes'), 349, null, false, now() - interval '19 hours');
insert into public.product_variants (product_id, sku, color, color_hex, size, price, stock, sort_order)
select (select id from public.products where slug = 'beach-slide-sandals'), v.sku, v.color, v.color_hex, v.size, v.price::numeric, v.stock, v.sort_order from (values
  ('BSS-BROWN-38', 'Brown', '#92400e', '38', null, 12, 0),
  ('BSS-BROWN-40', 'Brown', '#92400e', '40', null, 10, 1),
  ('BSS-BROWN-42', 'Brown', '#92400e', '42', null, 15, 2),
  ('BSS-BROWN-44', 'Brown', '#92400e', '44', 399, 25, 3),
  ('BSS-BLACK-38', 'Black', '#111827', '38', null, 15, 4),
  ('BSS-BLACK-40', 'Black', '#111827', '40', null, 10, 5),
  ('BSS-BLACK-42', 'Black', '#111827', '42', null, 8, 6),
  ('BSS-BLACK-44', 'Black', '#111827', '44', 399, 6, 7)
) as v(sku, color, color_hex, size, price, stock, sort_order);
insert into public.product_images (product_id, path, alt, color, sort_order)
select (select id from public.products where slug = 'beach-slide-sandals'), v.path, v.alt, v.color::text, v.sort_order from (values
  ('https://images.unsplash.com/photo-1603487742131-4160ec999306?auto=format&fit=crop&w=1200&q=80', 'Beach Slide Sandals', 'Brown', 0),
  ('https://images.unsplash.com/photo-1585120824848-8a5cd41493d2?auto=format&fit=crop&w=1200&q=80', 'Beach Slide Sandals', 'Black', 1),
  ('https://images.unsplash.com/photo-1627388484741-74dcc56ec343?auto=format&fit=crop&w=1200&q=80', 'Beach Slide Sandals', 'Brown', 2)
) as v(path, alt, color, sort_order);

-- Trailhead Leather Boots
insert into public.products (name, slug, description, category_id, base_price, compare_at_price, is_featured, created_at)
values ('Trailhead Leather Boots', 'trailhead-leather-boots', 'Full-grain leather lace-up boots with a rugged grip sole. Built to last for years.', (select id from public.categories where slug = 'shoes'), 1599, 1899, true, now() - interval '18 hours');
insert into public.product_variants (product_id, sku, color, color_hex, size, price, stock, sort_order)
select (select id from public.products where slug = 'trailhead-leather-boots'), v.sku, v.color, v.color_hex, v.size, v.price::numeric, v.stock, v.sort_order from (values
  ('TLB-TAN-40', 'Tan', '#b45309', '40', null, 4, 0),
  ('TLB-TAN-41', 'Tan', '#b45309', '41', null, 6, 1),
  ('TLB-TAN-42', 'Tan', '#b45309', '42', null, 2, 2),
  ('TLB-TAN-43', 'Tan', '#b45309', '43', null, 25, 3),
  ('TLB-TAN-44', 'Tan', '#b45309', '44', 1699, 8, 4),
  ('TLB-BLACK-40', 'Black', '#111827', '40', null, 20, 5),
  ('TLB-BLACK-41', 'Black', '#111827', '41', null, 15, 6),
  ('TLB-BLACK-42', 'Black', '#111827', '42', null, 10, 7),
  ('TLB-BLACK-43', 'Black', '#111827', '43', null, 15, 8),
  ('TLB-BLACK-44', 'Black', '#111827', '44', 1699, 8, 9)
) as v(sku, color, color_hex, size, price, stock, sort_order);
insert into public.product_images (product_id, path, alt, color, sort_order)
select (select id from public.products where slug = 'trailhead-leather-boots'), v.path, v.alt, v.color::text, v.sort_order from (values
  ('https://images.unsplash.com/photo-1608256246200-53e635b5b65f?auto=format&fit=crop&w=1200&q=80', 'Trailhead Leather Boots', 'Tan', 0),
  ('https://images.unsplash.com/photo-1605812860427-4024433a70fd?auto=format&fit=crop&w=1200&q=80', 'Trailhead Leather Boots', 'Tan', 1),
  ('https://images.unsplash.com/photo-1605732440685-d0654d81aa30?auto=format&fit=crop&w=1200&q=80', 'Trailhead Leather Boots', 'Black', 2)
) as v(path, alt, color, sort_order);

-- Reef Canvas Tote
insert into public.products (name, slug, description, category_id, base_price, compare_at_price, is_featured, created_at)
values ('Reef Canvas Tote', 'reef-canvas-tote', 'Durable cotton canvas tote with an inner pocket. Fits your laptop, groceries and beach towel.', (select id from public.categories where slug = 'accessories'), 199, 249, false, now() - interval '17 hours');
insert into public.product_variants (product_id, sku, color, color_hex, size, price, stock, sort_order)
select (select id from public.products where slug = 'reef-canvas-tote'), v.sku, v.color, v.color_hex, v.size, v.price::numeric, v.stock, v.sort_order from (values
  ('RCT-NATURA', 'Natural', '#f5f0e1', null, null, 8, 0),
  ('RCT-SAND', 'Sand', '#e7d3a8', null, null, 8, 1)
) as v(sku, color, color_hex, size, price, stock, sort_order);
insert into public.product_images (product_id, path, alt, color, sort_order)
select (select id from public.products where slug = 'reef-canvas-tote'), v.path, v.alt, v.color::text, v.sort_order from (values
  ('https://images.unsplash.com/photo-1544816155-12df9643f363?auto=format&fit=crop&w=1200&q=80', 'Reef Canvas Tote', 'Sand', 0),
  ('https://images.unsplash.com/photo-1574365569389-a10d488ca3fb?auto=format&fit=crop&w=1200&q=80', 'Reef Canvas Tote', 'Natural', 1),
  ('https://images.unsplash.com/photo-1630381260512-e3fe55c11973?auto=format&fit=crop&w=1200&q=80', 'Reef Canvas Tote', 'Natural', 2)
) as v(path, alt, color, sort_order);

-- Urban Daypack
insert into public.products (name, slug, description, category_id, base_price, compare_at_price, is_featured, created_at)
values ('Urban Daypack', 'urban-daypack', 'Water-resistant daypack with a padded laptop sleeve and plenty of organiser pockets.', (select id from public.categories where slug = 'accessories'), 899, null, true, now() - interval '16 hours');
insert into public.product_variants (product_id, sku, color, color_hex, size, price, stock, sort_order)
select (select id from public.products where slug = 'urban-daypack'), v.sku, v.color, v.color_hex, v.size, v.price::numeric, v.stock, v.sort_order from (values
  ('UD-BLACK', 'Black', '#111827', null, null, 20, 0),
  ('UD-BROWN', 'Brown', '#92400e', null, null, 12, 1),
  ('UD-RED', 'Red', '#dc2626', null, null, 4, 2)
) as v(sku, color, color_hex, size, price, stock, sort_order);
insert into public.product_images (product_id, path, alt, color, sort_order)
select (select id from public.products where slug = 'urban-daypack'), v.path, v.alt, v.color::text, v.sort_order from (values
  ('https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=1200&q=80', 'Urban Daypack', 'Black', 0),
  ('https://images.unsplash.com/photo-1622560480605-d83c853bc5c3?auto=format&fit=crop&w=1200&q=80', 'Urban Daypack', 'Brown', 1),
  ('https://images.unsplash.com/photo-1622560480654-d96214fdc887?auto=format&fit=crop&w=1200&q=80', 'Urban Daypack', 'Red', 2)
) as v(path, alt, color, sort_order);

-- Golden Hour Sunglasses
insert into public.products (name, slug, description, category_id, base_price, compare_at_price, is_featured, created_at)
values ('Golden Hour Sunglasses', 'golden-hour-sunglasses', 'UV400 polarised lenses in a lightweight frame. Style and protection under the tropical sun.', (select id from public.categories where slug = 'accessories'), 449, 599, true, now() - interval '15 hours');
insert into public.product_variants (product_id, sku, color, color_hex, size, price, stock, sort_order)
select (select id from public.products where slug = 'golden-hour-sunglasses'), v.sku, v.color, v.color_hex, v.size, v.price::numeric, v.stock, v.sort_order from (values
  ('GHS-GOLD', 'Gold', '#d4a017', null, null, 10, 0),
  ('GHS-IVORY', 'Ivory', '#f5f5dc', null, null, 4, 1),
  ('GHS-BLACK', 'Black', '#111827', null, null, 15, 2)
) as v(sku, color, color_hex, size, price, stock, sort_order);
insert into public.product_images (product_id, path, alt, color, sort_order)
select (select id from public.products where slug = 'golden-hour-sunglasses'), v.path, v.alt, v.color::text, v.sort_order from (values
  ('https://images.unsplash.com/photo-1511499767150-a48a237f0083?auto=format&fit=crop&w=1200&q=80', 'Golden Hour Sunglasses', 'Gold', 0),
  ('https://images.unsplash.com/photo-1577803645773-f96470509666?auto=format&fit=crop&w=1200&q=80', 'Golden Hour Sunglasses', 'Ivory', 1),
  ('https://images.unsplash.com/photo-1584036553516-bf83210aa16c?auto=format&fit=crop&w=1200&q=80', 'Golden Hour Sunglasses', 'Black', 2)
) as v(path, alt, color, sort_order);

-- Heritage Chronograph Watch
insert into public.products (name, slug, description, category_id, base_price, compare_at_price, is_featured, created_at)
values ('Heritage Chronograph Watch', 'heritage-chronograph-watch', 'Stainless-steel chronograph with sapphire-coated glass and a genuine leather strap. Water resistant to 50m.', (select id from public.categories where slug = 'accessories'), 1899, null, false, now() - interval '14 hours');
insert into public.product_variants (product_id, sku, color, color_hex, size, price, stock, sort_order)
select (select id from public.products where slug = 'heritage-chronograph-watch'), v.sku, v.color, v.color_hex, v.size, v.price::numeric, v.stock, v.sort_order from (values
  ('HCW-BROWNL', 'Brown Leather', '#78350f', null, null, 25, 0),
  ('HCW-BLACK', 'Black', '#111827', null, null, 8, 1)
) as v(sku, color, color_hex, size, price, stock, sort_order);
insert into public.product_images (product_id, path, alt, color, sort_order)
select (select id from public.products where slug = 'heritage-chronograph-watch'), v.path, v.alt, v.color::text, v.sort_order from (values
  ('https://images.unsplash.com/photo-1524805444758-089113d48a6d?auto=format&fit=crop&w=1200&q=80', 'Heritage Chronograph Watch', 'Brown Leather', 0),
  ('https://images.unsplash.com/photo-1620625515032-6ed0c1790c75?auto=format&fit=crop&w=1200&q=80', 'Heritage Chronograph Watch', 'Brown Leather', 1),
  ('https://images.unsplash.com/photo-1622434641406-a158123450f9?auto=format&fit=crop&w=1200&q=80', 'Heritage Chronograph Watch', 'Black', 2)
) as v(path, alt, color, sort_order);

-- Slim Leather Wallet
insert into public.products (name, slug, description, category_id, base_price, compare_at_price, is_featured, created_at)
values ('Slim Leather Wallet', 'slim-leather-wallet', 'Minimal bifold wallet in soft leather with six card slots. Slim enough for your front pocket.', (select id from public.categories where slug = 'accessories'), 299, null, false, now() - interval '13 hours');
insert into public.product_variants (product_id, sku, color, color_hex, size, price, stock, sort_order)
select (select id from public.products where slug = 'slim-leather-wallet'), v.sku, v.color, v.color_hex, v.size, v.price::numeric, v.stock, v.sort_order from (values
  ('SLW-BLACK', 'Black', '#111827', null, null, 8, 0),
  ('SLW-TAN', 'Tan', '#b45309', null, null, 18, 1)
) as v(sku, color, color_hex, size, price, stock, sort_order);
insert into public.product_images (product_id, path, alt, color, sort_order)
select (select id from public.products where slug = 'slim-leather-wallet'), v.path, v.alt, v.color::text, v.sort_order from (values
  ('https://images.unsplash.com/photo-1579014134953-1580d7f123f3?auto=format&fit=crop&w=1200&q=80', 'Slim Leather Wallet', 'Black', 0),
  ('https://images.unsplash.com/photo-1614330316567-11d8e572db16?auto=format&fit=crop&w=1200&q=80', 'Slim Leather Wallet', 'Tan', 1)
) as v(path, alt, color, sort_order);

-- Sunny Straw Hat
insert into public.products (name, slug, description, category_id, base_price, compare_at_price, is_featured, created_at)
values ('Sunny Straw Hat', 'sunny-straw-hat', 'Hand-woven wide-brim straw hat that keeps the sun off your face in style.', (select id from public.categories where slug = 'accessories'), 249, null, false, now() - interval '12 hours');
insert into public.product_variants (product_id, sku, color, color_hex, size, price, stock, sort_order)
select (select id from public.products where slug = 'sunny-straw-hat'), v.sku, v.color, v.color_hex, v.size, v.price::numeric, v.stock, v.sort_order from (values
  ('SSH-NATURA', 'Natural', '#d6b77f', null, null, 18, 0)
) as v(sku, color, color_hex, size, price, stock, sort_order);
insert into public.product_images (product_id, path, alt, color, sort_order)
select (select id from public.products where slug = 'sunny-straw-hat'), v.path, v.alt, v.color::text, v.sort_order from (values
  ('https://images.unsplash.com/photo-1583238619747-27950824e04d?auto=format&fit=crop&w=1200&q=80', 'Sunny Straw Hat', null, 0),
  ('https://images.unsplash.com/photo-1518061124653-4b85d51931f1?auto=format&fit=crop&w=1200&q=80', 'Sunny Straw Hat', null, 1)
) as v(path, alt, color, sort_order);

-- Smart Fit Watch
insert into public.products (name, slug, description, category_id, base_price, compare_at_price, is_featured, created_at)
values ('Smart Fit Watch', 'smart-fit-watch', 'Track steps, sleep and heart rate with a bright always-on display and 7-day battery.', (select id from public.categories where slug = 'electronics'), 1499, 1799, true, now() - interval '11 hours');
insert into public.product_variants (product_id, sku, color, color_hex, size, price, stock, sort_order)
select (select id from public.products where slug = 'smart-fit-watch'), v.sku, v.color, v.color_hex, v.size, v.price::numeric, v.stock, v.sort_order from (values
  ('SFW-BLACK', 'Black', '#111827', null, null, 18, 0),
  ('SFW-GRAPHI', 'Graphite', '#374151', null, null, 25, 1)
) as v(sku, color, color_hex, size, price, stock, sort_order);
insert into public.product_images (product_id, path, alt, color, sort_order)
select (select id from public.products where slug = 'smart-fit-watch'), v.path, v.alt, v.color::text, v.sort_order from (values
  ('https://images.unsplash.com/photo-1579586337278-3befd40fd17a?auto=format&fit=crop&w=1200&q=80', 'Smart Fit Watch', 'Black', 0),
  ('https://images.unsplash.com/photo-1624096104992-9b4fa3a279dd?auto=format&fit=crop&w=1200&q=80', 'Smart Fit Watch', 'Black', 1),
  ('https://images.unsplash.com/photo-1660844817855-3ecc7ef21f12?auto=format&fit=crop&w=1200&q=80', 'Smart Fit Watch', 'Graphite', 2)
) as v(path, alt, color, sort_order);

-- Morning Ceramic Mug
insert into public.products (name, slug, description, category_id, base_price, compare_at_price, is_featured, created_at)
values ('Morning Ceramic Mug', 'morning-ceramic-mug', 'Hand-glazed stoneware mug that holds 350ml of your favourite brew. Dishwasher safe.', (select id from public.categories where slug = 'home'), 129, null, false, now() - interval '10 hours');
insert into public.product_variants (product_id, sku, color, color_hex, size, price, stock, sort_order)
select (select id from public.products where slug = 'morning-ceramic-mug'), v.sku, v.color, v.color_hex, v.size, v.price::numeric, v.stock, v.sort_order from (values
  ('MCM-WHITE', 'White', '#f8fafc', null, null, 25, 0),
  ('MCM-SPECKL', 'Speckled', '#e7e5e4', null, null, 8, 1)
) as v(sku, color, color_hex, size, price, stock, sort_order);
insert into public.product_images (product_id, path, alt, color, sort_order)
select (select id from public.products where slug = 'morning-ceramic-mug'), v.path, v.alt, v.color::text, v.sort_order from (values
  ('https://images.unsplash.com/photo-1616241673111-508b4662c707?auto=format&fit=crop&w=1200&q=80', 'Morning Ceramic Mug', 'White', 0),
  ('https://images.unsplash.com/photo-1570784332176-fdd73da66f03?auto=format&fit=crop&w=1200&q=80', 'Morning Ceramic Mug', 'White', 1),
  ('https://images.unsplash.com/photo-1520485521983-bfaa0bc6c80e?auto=format&fit=crop&w=1200&q=80', 'Morning Ceramic Mug', 'Speckled', 2)
) as v(path, alt, color, sort_order);

-- Amber Glow Candle
insert into public.products (name, slug, description, category_id, base_price, compare_at_price, is_featured, created_at)
values ('Amber Glow Candle', 'amber-glow-candle', 'Soy-wax candle in an amber glass jar with notes of vanilla and coconut. Around 40 hours of burn time.', (select id from public.categories where slug = 'home'), 189, 229, true, now() - interval '9 hours');
insert into public.product_variants (product_id, sku, color, color_hex, size, price, stock, sort_order)
select (select id from public.products where slug = 'amber-glow-candle'), v.sku, v.color, v.color_hex, v.size, v.price::numeric, v.stock, v.sort_order from (values
  ('AGC-VANILL', 'Vanilla Coconut', '#fde68a', null, null, 8, 0),
  ('AGC-SEASAL', 'Sea Salt', '#bae6fd', null, null, 18, 1)
) as v(sku, color, color_hex, size, price, stock, sort_order);
insert into public.product_images (product_id, path, alt, color, sort_order)
select (select id from public.products where slug = 'amber-glow-candle'), v.path, v.alt, v.color::text, v.sort_order from (values
  ('https://images.unsplash.com/photo-1612293905607-b003de9e54fb?auto=format&fit=crop&w=1200&q=80', 'Amber Glow Candle', null, 0),
  ('https://images.unsplash.com/photo-1640095889747-2090ee12fa7d?auto=format&fit=crop&w=1200&q=80', 'Amber Glow Candle', null, 1),
  ('https://images.unsplash.com/photo-1561212856-44e9bae482aa?auto=format&fit=crop&w=1200&q=80', 'Amber Glow Candle', null, 2)
) as v(path, alt, color, sort_order);

-- Cozy Throw Pillow
insert into public.products (name, slug, description, category_id, base_price, compare_at_price, is_featured, created_at)
values ('Cozy Throw Pillow', 'cozy-throw-pillow', 'Textured cotton cushion cover with a soft insert. Instantly refreshes any sofa or bed.', (select id from public.categories where slug = 'home'), 249, null, false, now() - interval '8 hours');
insert into public.product_variants (product_id, sku, color, color_hex, size, price, stock, sort_order)
select (select id from public.products where slug = 'cozy-throw-pillow'), v.sku, v.color, v.color_hex, v.size, v.price::numeric, v.stock, v.sort_order from (values
  ('CTP-WHITE', 'White', '#f8fafc', null, null, 25, 0),
  ('CTP-BLUEST', 'Blue Stripe', '#60a5fa', null, null, 8, 1)
) as v(sku, color, color_hex, size, price, stock, sort_order);
insert into public.product_images (product_id, path, alt, color, sort_order)
select (select id from public.products where slug = 'cozy-throw-pillow'), v.path, v.alt, v.color::text, v.sort_order from (values
  ('https://images.unsplash.com/photo-1629949009765-40fc74c9ec21?auto=format&fit=crop&w=1200&q=80', 'Cozy Throw Pillow', 'White', 0),
  ('https://images.unsplash.com/photo-1759517857499-7f27b61aad5d?auto=format&fit=crop&w=1200&q=80', 'Cozy Throw Pillow', 'Blue Stripe', 1),
  ('https://images.unsplash.com/photo-1538577880403-f9998e75dd06?auto=format&fit=crop&w=1200&q=80', 'Cozy Throw Pillow', null, 2)
) as v(path, alt, color, sort_order);

-- Terracotta Plant Pot
insert into public.products (name, slug, description, category_id, base_price, compare_at_price, is_featured, created_at)
values ('Terracotta Plant Pot', 'terracotta-plant-pot', 'Glazed ceramic planter with a drainage hole. Plant not included.', (select id from public.categories where slug = 'home'), 159, null, false, now() - interval '7 hours');
insert into public.product_variants (product_id, sku, color, color_hex, size, price, stock, sort_order)
select (select id from public.products where slug = 'terracotta-plant-pot'), v.sku, v.color, v.color_hex, v.size, v.price::numeric, v.stock, v.sort_order from (values
  ('TPP-TEAL', 'Teal', '#14b8a6', null, null, 0, 0),
  ('TPP-WHITE', 'White', '#f8fafc', null, null, 8, 1),
  ('TPP-TERRAC', 'Terracotta', '#c2410c', null, null, 25, 2)
) as v(sku, color, color_hex, size, price, stock, sort_order);
insert into public.product_images (product_id, path, alt, color, sort_order)
select (select id from public.products where slug = 'terracotta-plant-pot'), v.path, v.alt, v.color::text, v.sort_order from (values
  ('https://images.unsplash.com/photo-1485955900006-10f4d324d411?auto=format&fit=crop&w=1200&q=80', 'Terracotta Plant Pot', 'Teal', 0),
  ('https://images.unsplash.com/photo-1509423350716-97f9360b4e09?auto=format&fit=crop&w=1200&q=80', 'Terracotta Plant Pot', 'White', 1),
  ('https://images.unsplash.com/photo-1459411552884-841db9b3cc2a?auto=format&fit=crop&w=1200&q=80', 'Terracotta Plant Pot', 'Terracotta', 2)
) as v(path, alt, color, sort_order);

-- Nordic Table Lamp
insert into public.products (name, slug, description, category_id, base_price, compare_at_price, is_featured, created_at)
values ('Nordic Table Lamp', 'nordic-table-lamp', 'Warm ambient table lamp with a fabric shade and wooden accents. E27 bulb included.', (select id from public.categories where slug = 'home'), 699, 849, false, now() - interval '6 hours');
insert into public.product_variants (product_id, sku, color, color_hex, size, price, stock, sort_order)
select (select id from public.products where slug = 'nordic-table-lamp'), v.sku, v.color, v.color_hex, v.size, v.price::numeric, v.stock, v.sort_order from (values
  ('NTL-WHITE', 'White', '#f8fafc', null, null, 25, 0),
  ('NTL-WOOD', 'Wood', '#a16207', null, null, 18, 1)
) as v(sku, color, color_hex, size, price, stock, sort_order);
insert into public.product_images (product_id, path, alt, color, sort_order)
select (select id from public.products where slug = 'nordic-table-lamp'), v.path, v.alt, v.color::text, v.sort_order from (values
  ('https://images.unsplash.com/photo-1570974802254-4b0ad1a755f5?auto=format&fit=crop&w=1200&q=80', 'Nordic Table Lamp', 'White', 0),
  ('https://images.unsplash.com/photo-1517991104123-1d56a6e81ed9?auto=format&fit=crop&w=1200&q=80', 'Nordic Table Lamp', 'Wood', 1),
  ('https://images.unsplash.com/photo-1580130281320-0ef0754f2bf7?auto=format&fit=crop&w=1200&q=80', 'Nordic Table Lamp', 'White', 2)
) as v(path, alt, color, sort_order);

-- Wave Wireless Headphones
insert into public.products (name, slug, description, category_id, base_price, compare_at_price, is_featured, created_at)
values ('Wave Wireless Headphones', 'wave-wireless-headphones', 'Over-ear Bluetooth headphones with active noise cancelling and 30-hour battery life.', (select id from public.categories where slug = 'electronics'), 1299, 1599, true, now() - interval '5 hours');
insert into public.product_variants (product_id, sku, color, color_hex, size, price, stock, sort_order)
select (select id from public.products where slug = 'wave-wireless-headphones'), v.sku, v.color, v.color_hex, v.size, v.price::numeric, v.stock, v.sort_order from (values
  ('WWH-SILVER', 'Silver', '#d1d5db', null, null, 12, 0),
  ('WWH-BLACK', 'Black', '#111827', null, null, 10, 1),
  ('WWH-PINK', 'Pink', '#f9a8d4', null, null, 0, 2)
) as v(sku, color, color_hex, size, price, stock, sort_order);
insert into public.product_images (product_id, path, alt, color, sort_order)
select (select id from public.products where slug = 'wave-wireless-headphones'), v.path, v.alt, v.color::text, v.sort_order from (values
  ('https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=1200&q=80', 'Wave Wireless Headphones', 'Silver', 0),
  ('https://images.unsplash.com/photo-1618366712010-f4ae9c647dcb?auto=format&fit=crop&w=1200&q=80', 'Wave Wireless Headphones', 'Black', 1),
  ('https://images.unsplash.com/photo-1613040809024-b4ef7ba99bc3?auto=format&fit=crop&w=1200&q=80', 'Wave Wireless Headphones', 'Pink', 2)
) as v(path, alt, color, sort_order);

-- Pocket Boom Speaker
insert into public.products (name, slug, description, category_id, base_price, compare_at_price, is_featured, created_at)
values ('Pocket Boom Speaker', 'pocket-boom-speaker', 'Splash-proof portable Bluetooth speaker with punchy bass and 12-hour playtime.', (select id from public.categories where slug = 'electronics'), 799, null, false, now() - interval '4 hours');
insert into public.product_variants (product_id, sku, color, color_hex, size, price, stock, sort_order)
select (select id from public.products where slug = 'pocket-boom-speaker'), v.sku, v.color, v.color_hex, v.size, v.price::numeric, v.stock, v.sort_order from (values
  ('PBS-BLACK', 'Black', '#111827', null, null, 25, 0),
  ('PBS-WHITE', 'White', '#f8fafc', null, null, 18, 1)
) as v(sku, color, color_hex, size, price, stock, sort_order);
insert into public.product_images (product_id, path, alt, color, sort_order)
select (select id from public.products where slug = 'pocket-boom-speaker'), v.path, v.alt, v.color::text, v.sort_order from (values
  ('https://images.unsplash.com/photo-1589003077984-894e133dabab?auto=format&fit=crop&w=1200&q=80', 'Pocket Boom Speaker', 'Black', 0),
  ('https://images.unsplash.com/photo-1507878566509-a0dbe19677a5?auto=format&fit=crop&w=1200&q=80', 'Pocket Boom Speaker', 'Black', 1),
  ('https://images.unsplash.com/photo-1582978571763-2d039e56f0c3?auto=format&fit=crop&w=1200&q=80', 'Pocket Boom Speaker', 'White', 2)
) as v(path, alt, color, sort_order);

-- Clicky Mechanical Keyboard
insert into public.products (name, slug, description, category_id, base_price, compare_at_price, is_featured, created_at)
values ('Clicky Mechanical Keyboard', 'clicky-mechanical-keyboard', '75% hot-swappable mechanical keyboard with colourful keycaps and RGB backlight.', (select id from public.categories where slug = 'electronics'), 1099, null, false, now() - interval '3 hours');
insert into public.product_variants (product_id, sku, color, color_hex, size, price, stock, sort_order)
select (select id from public.products where slug = 'clicky-mechanical-keyboard'), v.sku, v.color, v.color_hex, v.size, v.price::numeric, v.stock, v.sort_order from (values
  ('CMK-MINT', 'Mint', '#5eead4', null, null, 4, 0),
  ('CMK-LEMON', 'Lemon', '#fde047', null, null, 25, 1),
  ('CMK-BLACK', 'Black', '#111827', null, null, 2, 2)
) as v(sku, color, color_hex, size, price, stock, sort_order);
insert into public.product_images (product_id, path, alt, color, sort_order)
select (select id from public.products where slug = 'clicky-mechanical-keyboard'), v.path, v.alt, v.color::text, v.sort_order from (values
  ('https://images.unsplash.com/photo-1595044426077-d36d9236d54a?auto=format&fit=crop&w=1200&q=80', 'Clicky Mechanical Keyboard', 'Mint', 0),
  ('https://images.unsplash.com/photo-1601445638532-3c6f6c3aa1d6?auto=format&fit=crop&w=1200&q=80', 'Clicky Mechanical Keyboard', 'Lemon', 1),
  ('https://images.unsplash.com/photo-1618384887929-16ec33fab9ef?auto=format&fit=crop&w=1200&q=80', 'Clicky Mechanical Keyboard', 'Black', 2)
) as v(path, alt, color, sort_order);

-- Glow Serum Set
insert into public.products (name, slug, description, category_id, base_price, compare_at_price, is_featured, created_at)
values ('Glow Serum Set', 'glow-serum-set', 'Vitamin C brightening serum and hydrating hyaluronic serum. A simple routine for radiant skin.', (select id from public.categories where slug = 'beauty'), 549, 649, true, now() - interval '2 hours');
insert into public.product_variants (product_id, sku, color, color_hex, size, price, stock, sort_order)
select (select id from public.products where slug = 'glow-serum-set'), v.sku, v.color, v.color_hex, v.size, v.price::numeric, v.stock, v.sort_order from (values
  ('GSS-STD', null, null, null, null, 25, 0)
) as v(sku, color, color_hex, size, price, stock, sort_order);
insert into public.product_images (product_id, path, alt, color, sort_order)
select (select id from public.products where slug = 'glow-serum-set'), v.path, v.alt, v.color::text, v.sort_order from (values
  ('https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?auto=format&fit=crop&w=1200&q=80', 'Glow Serum Set', null, 0),
  ('https://images.unsplash.com/photo-1620916297397-a4a5402a3c6c?auto=format&fit=crop&w=1200&q=80', 'Glow Serum Set', null, 1),
  ('https://images.unsplash.com/photo-1552046122-03184de85e08?auto=format&fit=crop&w=1200&q=80', 'Glow Serum Set', null, 2)
) as v(path, alt, color, sort_order);

-- Ocean Mist Perfume
insert into public.products (name, slug, description, category_id, base_price, compare_at_price, is_featured, created_at)
values ('Ocean Mist Perfume', 'ocean-mist-perfume', 'Fresh aquatic eau de parfum with notes of sea salt, citrus and white musk. 50ml.', (select id from public.categories where slug = 'beauty'), 899, null, false, now() - interval '1 hours');
insert into public.product_variants (product_id, sku, color, color_hex, size, price, stock, sort_order)
select (select id from public.products where slug = 'ocean-mist-perfume'), v.sku, v.color, v.color_hex, v.size, v.price::numeric, v.stock, v.sort_order from (values
  ('OMP-STD-30ML', null, null, '30ml', null, 8, 0),
  ('OMP-STD-50ML', null, null, '50ml', 949, 12, 1)
) as v(sku, color, color_hex, size, price, stock, sort_order);
insert into public.product_images (product_id, path, alt, color, sort_order)
select (select id from public.products where slug = 'ocean-mist-perfume'), v.path, v.alt, v.color::text, v.sort_order from (values
  ('https://images.unsplash.com/photo-1458538977777-0549b2370168?auto=format&fit=crop&w=1200&q=80', 'Ocean Mist Perfume', null, 0),
  ('https://images.unsplash.com/photo-1594035910387-fea47794261f?auto=format&fit=crop&w=1200&q=80', 'Ocean Mist Perfume', null, 1),
  ('https://images.unsplash.com/photo-1622618991746-fe6004db3a47?auto=format&fit=crop&w=1200&q=80', 'Ocean Mist Perfume', null, 2)
) as v(path, alt, color, sort_order);

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

commit;
