# Online Store — Next.js + Supabase

A modern, responsive online store with bank-transfer payments (customers upload their BML slip), built with **Next.js 15 (App Router)**, **Supabase** (Postgres, Auth, Storage), **Tailwind CSS v4** and **Motion** animations. Deploys to **Vercel**.

## Features

**Storefront**
- Animated home page (hero, colourful category tiles, featured & new arrivals)
- Product listing with **search, category / colour / size / price / in-stock filters, sorting and pagination** (all in the URL, so links are shareable)
- Product page with animated **multi-image gallery** (swipe, thumbnails, hover zoom), **variant picker** (colour swatches + sizes), live stock messages, colour-linked images, SEO JSON-LD
- Persistent cart (drawer + page) that re-validates prices & stock against the database
- Guest checkout → order page with bank details (copy buttons) → **payment-slip upload** (compressed in the browser *and* on the server)
- Order tracking by private link, or by order number + phone

**Order statuses:** `pending` → `slip_uploaded` → `approved` → `delivered`, or `rejected` (stock is returned automatically). An admin can also send a `slip_uploaded` order back to `pending` to ask for a new slip.

**Admin (`/admin`)**
- Dashboard: revenue, orders, average order value, slips awaiting review, 30-day revenue chart, orders by status, top sellers, low-stock alerts
- Orders: filter by status, search, view the slip (private, short-lived signed URL), approve / reject (with reason) / mark delivered, internal notes, full status history
- Products: create/edit, variants (colour, hex swatch, size, SKU, price override, stock), multi-image upload with reordering, colour tagging, alt text, show/hide, featured
- Categories: create/edit with colours and ordering

## Image compression

Every image is compressed twice so storage stays small:

| | Browser (before upload) | Server (`sharp`) | Typical result |
|---|---|---|---|
| Product photos | resize ≤1800px, WebP | resize ≤1600px, WebP q80, metadata stripped, ≤600 KB target | 80–300 KB |
| Payment slips | resize ≤1400px, WebP | resize ≤1400px, WebP q72, ≤350 KB target | 50–200 KB |

The server decodes every file to prove it's really an image (MIME type isn't trusted), strips EXIF/GPS data and re-encodes it. Images are stored in **Supabase Storage**, and only the file path is saved in the database. Storage buckets only accept `image/webp` with size caps (3 MB / 2 MB).

## Security

- **Row Level Security on every table.** The public can only read active catalog rows. Orders can't be read or written directly by the public at all.
- Orders are created by a `SECURITY DEFINER` Postgres function (`place_order`) that **locks stock rows, uses database prices (never the cart's), checks stock and decrements it in one transaction**, so overselling is impossible.
- Status changes go through `set_order_status`, which enforces the allowed transitions and checks the admin role in the database.
- Admins are identified by `profiles.role = 'admin'`. Users can't change their own role (no update grant/policy).
- Every admin page **and** server action re-checks the admin session with `supabase.auth.getUser()`, so the middleware isn't the only protection.
- Payment slips sit in a **private bucket**. Admins see them through 10-minute signed URLs.
- Customer order links are signed with an HMAC (`ORDER_TOKEN_SECRET`) and compared in constant time.
- Postgres-backed **rate limiting** on checkout, slip uploads, order lookups and admin login (works across serverless instances).
- Zod validation on all inputs, a honeypot field on checkout, search input sanitised before it reaches PostgREST filters, and an open-redirect-safe login redirect.
- Security headers: CSP, HSTS, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy. Admin pages are `no-store` + `noindex`.
- The service-role key is only used in `server-only` modules.

## Setup

### 1. Supabase
1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor** and run `supabase/migrations/0001_init.sql`. Optionally run `supabase/seed.sql` for demo categories and products.
3. **Authentication → Providers → Email:** turn off "Allow new users to sign up". Customers don't need accounts, and this keeps strangers from creating logins.
4. **Authentication → Users → Add user:** create your admin user (email + password).
5. Make that user an admin (SQL Editor):
   ```sql
   update public.profiles set role = 'admin'
   where id = (select id from auth.users where email = 'you@example.com');
   ```

### 2. Local development
```bash
npm install
cp .env.example .env.local   # then fill in the values
npm run dev
```
Open http://localhost:3000. The admin panel is at http://localhost:3000/admin.

Generate `ORDER_TOKEN_SECRET` with:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Deploy to Vercel
1. Push this folder to a GitHub repo and import it in Vercel.
2. Add all the variables from `.env.example` under **Project → Settings → Environment Variables**. Set `NEXT_PUBLIC_SITE_URL` to your production URL.
3. Deploy.

> `SUPABASE_SERVICE_ROLE_KEY` and `ORDER_TOKEN_SECRET` must **never** have a `NEXT_PUBLIC_` prefix.
> If you change `ORDER_TOKEN_SECRET` later, existing customer order links stop working (customers can still use "Track order").

## Environment variables

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon / publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | service role / secret key (server only) |
| `ORDER_TOKEN_SECRET` | 32+ random chars, signs order links |
| `NEXT_PUBLIC_SITE_URL` | e.g. `https://yourstore.com` |
| `NEXT_PUBLIC_STORE_NAME` | Store name shown in the UI |
| `NEXT_PUBLIC_CURRENCY` | Default `MVR` |
| `DELIVERY_FEE` | Flat delivery fee added to each order (`0` = free) |
| `NEXT_PUBLIC_BANK_NAME` / `_ACCOUNT_NAME` / `_ACCOUNT_NUMBER` | Bank details shown on the payment page |
| `NEXT_PUBLIC_CONTACT_PHONE` | Shown in the footer |

## Project structure

```
src/
  app/
    (shop)/            storefront: home, products, product detail, cart, checkout, orders, track
    admin/
      login/           admin sign-in
      (panel)/         protected admin pages: dashboard, orders, products, categories
      actions.ts       admin server actions (all re-check admin)
    actions/orders.ts  customer server actions (place order, upload slip, lookup)
  components/          UI components (storefront + admin/)
  lib/
    supabase/          server / browser / service / public clients + middleware helper
    image-processing.ts  sharp compression (server)
    compress-image.ts    canvas compression (browser)
    validation.ts      zod schemas
    auth.ts            requireAdmin / assertAdmin
    rate-limit.ts      Postgres-backed rate limiting
supabase/
  migrations/0001_init.sql   schema, RLS, functions, storage buckets & policies
  seed.sql                   optional demo data
```

## Notes
- Next.js image optimisation on Vercel's Hobby plan has a monthly quota. Images are already small WebP files, so if you reach the quota you can set `images.unoptimized = true` in `next.config.ts`.
- The CSP allows `'unsafe-inline'` scripts because Next.js needs it without nonces. For a stricter policy, switch to nonce-based CSP in middleware (this makes every page dynamic).
- To edit store settings (bank details, delivery fee), change the environment variables and redeploy.
