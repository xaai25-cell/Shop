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
