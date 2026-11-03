-- =====================================================================
--  Roles: admin, manager, staff (+ customer)
--    staff   → view & edit products and categories (no deleting them)
--    manager → everything except managing users
--    admin   → everything, including users
--  Safe to run more than once.
-- =====================================================================

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('customer', 'staff', 'manager', 'admin'));

-- Role helpers (SECURITY DEFINER so RLS on profiles doesn't recurse)
create or replace function public.current_role_name()
returns text language sql stable security definer set search_path = '' as $$
  select coalesce((select p.role from public.profiles p where p.id = auth.uid()), 'anon');
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.current_role_name() = 'admin';
$$;

create or replace function public.is_manager()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.current_role_name() in ('manager', 'admin');
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.current_role_name() in ('staff', 'manager', 'admin');
$$;

grant execute on function public.current_role_name(), public.is_admin(), public.is_manager(), public.is_staff()
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- Profiles: everyone reads their own row; admins read all
-- ---------------------------------------------------------------------
drop policy if exists "profiles self read" on public.profiles;
create policy "profiles self read" on public.profiles
  for select to authenticated using (id = (select auth.uid()) or (select public.is_admin()));

-- ---------------------------------------------------------------------
-- Catalog: staff+ can read hidden items, create and edit.
-- Deleting products / categories is manager+.
-- Variants & images can be removed by staff (needed when editing).
-- ---------------------------------------------------------------------
drop policy if exists "categories public read" on public.categories;
create policy "categories public read" on public.categories
  for select using (is_active or (select public.is_staff()));
drop policy if exists "categories admin write" on public.categories;
drop policy if exists "categories staff insert" on public.categories;
drop policy if exists "categories staff update" on public.categories;
drop policy if exists "categories manager delete" on public.categories;
create policy "categories staff insert" on public.categories
  for insert to authenticated with check ((select public.is_staff()));
create policy "categories staff update" on public.categories
  for update to authenticated using ((select public.is_staff())) with check ((select public.is_staff()));
create policy "categories manager delete" on public.categories
  for delete to authenticated using ((select public.is_manager()));

drop policy if exists "products public read" on public.products;
create policy "products public read" on public.products
  for select using (is_active or (select public.is_staff()));
drop policy if exists "products admin write" on public.products;
drop policy if exists "products staff insert" on public.products;
drop policy if exists "products staff update" on public.products;
drop policy if exists "products manager delete" on public.products;
create policy "products staff insert" on public.products
  for insert to authenticated with check ((select public.is_staff()));
create policy "products staff update" on public.products
  for update to authenticated using ((select public.is_staff())) with check ((select public.is_staff()));
create policy "products manager delete" on public.products
  for delete to authenticated using ((select public.is_manager()));

drop policy if exists "images public read" on public.product_images;
create policy "images public read" on public.product_images
  for select using (exists (select 1 from public.products p where p.id = product_id and (p.is_active or (select public.is_staff()))));
drop policy if exists "images admin write" on public.product_images;
drop policy if exists "images staff write" on public.product_images;
create policy "images staff write" on public.product_images
  for all to authenticated using ((select public.is_staff())) with check ((select public.is_staff()));

drop policy if exists "variants public read" on public.product_variants;
create policy "variants public read" on public.product_variants
  for select using (exists (select 1 from public.products p where p.id = product_id and (p.is_active or (select public.is_staff()))));
drop policy if exists "variants admin write" on public.product_variants;
drop policy if exists "variants staff write" on public.product_variants;
create policy "variants staff write" on public.product_variants
  for all to authenticated using ((select public.is_staff())) with check ((select public.is_staff()));

-- ---------------------------------------------------------------------
-- Orders: manager+
-- ---------------------------------------------------------------------
drop policy if exists "orders admin read" on public.orders;
create policy "orders admin read" on public.orders
  for select to authenticated using ((select public.is_manager()));
drop policy if exists "orders admin note" on public.orders;
create policy "orders admin note" on public.orders
  for update to authenticated using ((select public.is_manager())) with check ((select public.is_manager()));
drop policy if exists "order items admin read" on public.order_items;
create policy "order items admin read" on public.order_items
  for select to authenticated using ((select public.is_manager()));
drop policy if exists "order history admin read" on public.order_status_history;
create policy "order history admin read" on public.order_status_history
  for select to authenticated using ((select public.is_manager()));

create or replace function public.set_order_status(p_order_id uuid, p_status public.order_status, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_current public.order_status;
  v_restored boolean;
  v_allowed boolean;
begin
  if not public.is_manager() then
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

create or replace function public.admin_stats(p_days int default 30)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v jsonb;
begin
  if not public.is_manager() then raise exception 'FORBIDDEN'; end if;

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

-- ---------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------
drop policy if exists "product images admin insert" on storage.objects;
create policy "product images admin insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'product-images' and (select public.is_staff()));
drop policy if exists "product images admin update" on storage.objects;
create policy "product images admin update" on storage.objects
  for update to authenticated using (bucket_id = 'product-images' and (select public.is_staff()));
drop policy if exists "product images admin delete" on storage.objects;
create policy "product images admin delete" on storage.objects
  for delete to authenticated using (bucket_id = 'product-images' and (select public.is_staff()));
drop policy if exists "receipts admin read" on storage.objects;
create policy "receipts admin read" on storage.objects
  for select to authenticated using (bucket_id = 'receipts' and (select public.is_manager()));
