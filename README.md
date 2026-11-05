# CRP Ticket

CRP Ticket is an Uzbek-language event ticket marketplace built with React, TypeScript, Tailwind CSS, Supabase, and FastAPI. The site uses device-persisted anonymous accounts with a name and a contact phone number (no SMS verification), transactional seat reservations, proof-of-payment uploads, Gemini-assisted receipt review with mandatory administrator approval, QR tickets, a ticket wallet, and role-protected event administration.

## Architecture

- **Frontend:** Vite + React/TypeScript. Supabase Auth and Row Level Security are used directly from the browser; the Supabase publishable key is safe for browser use.
- **Database and storage:** PostgreSQL tables, security-definer RPCs, RLS policies, and two Storage buckets are created by `supabase/migrations/202611030001_crp_ticket_platform.sql`.
- **API:** FastAPI validates a user's Supabase access token, checks each reservation, reads the receipt from private Storage, and calls Gemini from the server. The service-role and Gemini keys never go to the browser.
- **Hosting:** Vercel serves the frontend and FastAPI serverless function on the same origin. Receipt images upload directly to private Supabase Storage, avoiding serverless request-size limits.

See [docs/CRP-TICKET-ARCHITECTURE.md](docs/CRP-TICKET-ARCHITECTURE.md) for the schema, component tree, API contract, security boundaries, and deployment checklist.

## Local development

1. Apply the CRP Ticket migrations in timestamp order to the connected Supabase project. New and existing ticket accounts receive a stable, unique six-digit user ID in `123-456` format. The migrations add event creation/editing, poster and artist images, offline-sold and invitation seat management, payment review, ticket expiry, admin-only event-data cleanup, realtime payment-order notifications, and atomic cancellation or replacement of a user's active seat reservation.
2. In Supabase **Authentication → Providers**, enable **Anonymous Sign-Ins**. Phone Auth and an SMS provider are not required. Set the production site URL under **Authentication → URL Configuration**.
3. Copy `.env.example` to `.env.local` and set `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, and `VITE_TICKET_API_URL=http://localhost:8000`.
4. Copy `backend/.env.example` to `backend/.env`, fill in the server-only Supabase and Gemini keys, and follow [backend/README.md](backend/README.md) to start the API. Gemini also powers the authenticated CRP Ticket Support chat.
5. Add the first administrator's role using the trusted Supabase SQL Editor:

   ```sql
   update auth.users u
   set raw_app_meta_data = coalesce(u.raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
   from public.ticket_profiles p
   where p.user_id = u.id and p.user_code = '123-456';
   ```

   The role is read from server-managed `app_metadata`; a browser-supplied flag cannot grant admin access.
6. Run the frontend:

   ```powershell
   npm install
   npm run dev
   npm run typecheck
   npm run lint
   npm run build
   ```

## Deployment

Keep the existing Vercel project and Supabase project connected. Add the server-only variables `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `GEMINI_API_KEY` to Vercel Production. Optionally set `GEMINI_MODEL`. Keep `VITE_TICKET_API_URL` unset in production so the frontend calls the same-origin Vercel function. Never add `SUPABASE_SERVICE_ROLE_KEY` or `GEMINI_API_KEY` to `VITE_` variables.

The payment flow is manual P2P transfer: an administrator configures the receiving card on each event, and buyers upload an image receipt. Gemini reads the visible amount, transfer state, and receiver-card suffix to help prioritize review. **Every receipt requires an administrator's explicit approval before a ticket is created**; AI never approves payment or issues a ticket. This is an evidence check, not a payment-provider settlement or bank reconciliation.

Charity allocation is recorded on approved ticket orders at the configured percentage; it does not automatically transfer money to a charity. Ticket QR codes open the server-side verification page. PostgreSQL serializes seat reservations and approval/rejection transactions and enforces unique live-seat, order, and ticket constraints. Tickets expire exactly 48 hours after the event's admin-entered end time; a database job marks them expired, removes them from the wallet/verification, and purges expired ticket rows after a 30-day audit window.

## Supabase data reset

The connected production Supabase project was reset for CRP Ticket at the owner's request: legacy public ANONI tables and Auth accounts were removed before the CRP Ticket schema was applied. The legacy migration files remain in the repository, but their old tables are no longer part of the production project.
