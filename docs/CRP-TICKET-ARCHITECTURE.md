# CRP Ticket architecture

## Application structure

```text
src/
  main.tsx
  tickets/
    App.tsx             app shell, session and page navigation
    AuthDialog.tsx      phone OTP sign-in and profile completion
    HomePage.tsx        hero carousel and event catalogue
    EventDetail.tsx     seat map, atomic reservation and payment instructions
    TicketWallet.tsx    pending orders, downloadable QR tickets and ticket wallet
    SupportChat.tsx     authenticated Gemini support chat
    TicketVerification.tsx public server-side QR validation
    AdminPanel.tsx      event, payment-review, inventory and cropped-banner tools
    api.ts              authenticated FastAPI receipt upload
    supabase.ts         browser Supabase client
    types.ts            event, seat, order, banner and ticket shapes
backend/
  main.py               FastAPI auth, private upload, Gemini review/support and QR verification
supabase/
  migrations/
    202611030001_crp_ticket_platform.sql
    202611030002_ticket_profile_user_code.sql
    202611030003_ticket_contact_phone_no_sms.sql
    202611030004_ticket_proof_client_upload.sql
    202611040001_ticket_short_user_code.sql
    202611040002_ticket_event_edit_and_media.sql
    202611050001_ticket_checkout_support_expiry.sql
    202611050002_ticket_event_media_columns.sql
    202611050003_ticket_admin_event_purge.sql
    202611050004_admin_payment_realtime.sql
    202611050005_ticket_change_reservation.sql
```

Historical, unreferenced source files remain outside the active `src/main.tsx` entry point. The active application and its alternate `src/main.jsx` entry both load the CRP Ticket app.

## Data model

| Table | Purpose | Important relationships / invariants |
|---|---|---|
| `ticket_profiles` | Contact phone, customer name and public user ID | One row per `auth.users`; stable unique six-digit user ID formatted as `123-456` |
| `ticket_events` | Event start/end, venue, sale dates, price, recipient card, poster, artist photo and charity settings | `sales_start_at < sales_end_at <= starts_at < ends_at`; at most 5,000 seats |
| `ticket_seats` | Per-event seat inventory | Unique `(event_id, seat_number)`; invitation, online-sold and offline-sold seats cannot be reserved |
| `ticket_orders` | Reservation and uploaded-payment review state | One live/approved order per seat; 10-minute reservation until a proof is submitted |
| `ticket_tickets` | Issued QR-ticket identity and lifecycle | One ticket per order and seat; random unique `ticket_code`; valid, expired or cancelled |
| `ticket_banners` | Hero carousel metadata | Public images in `ticket-banners`; administrators manage metadata |

Seat creation and order status changes are transactional database functions. Seat rows are locked during reservation, a partial unique index allows only one live/approved order per seat, and unique ticket/order/seat constraints prevent duplicate issuance. The `ticket-payment-proofs` bucket is private; only the buyer and admins can read a proof. Event and seat inventory are publicly readable only for published events. Order and ticket rows are restricted to their owner or an administrator. The admin buyer directory groups approved purchases by user and reads names and phone numbers only through administrator-protected profile/order policies. Wallet RLS and QR verification compare expiry using PostgreSQL server time.

Administrators enter event and sales dates with separate calendar-date and 24-hour time fields. Values are saved as Uzbekistan time (Asia/Tashkent, UTC+5), and event times are displayed in that timezone regardless of the viewer's device timezone.

## Main database RPCs

- `ticket_admin_create_event(p_event, p_invitation_seats)` creates the event and its complete seat inventory in one transaction. Invitation ranges are expanded and validated by the frontend, then every seat number is checked again by the function.
- The new-event form accepts optional poster and artist images after the charity controls; images up to 30 MB are accepted, and files over 9 MB are resized/compressed in the browser to fit the 10 MB public `ticket-banners` bucket limit. Images of any aspect ratio are fitted without cropping in event cards and detail pages.
- `ticket_admin_update_event(p_event_id, p_event, p_offline_seats)` updates event details and image URLs and atomically marks selected available seats as sold offline. It cannot change seats that are already reserved, sold online, or reserved for invitations.
- `ticket_reserve_seat(p_seat_id)` locks the seat row, enforces sale dates and availability, creates a 10-minute reservation, and returns its order ID. Concurrent buyers cannot reserve the same seat.
- `ticket_change_reservation(p_order_id, p_new_seat_id)` atomically cancels an unsubmitted reservation when the new seat is null, or moves it to another available seat while retaining the original expiration time. Only the reservation owner can call it; failed seat changes leave the original reservation intact.
- `ticket_set_order_review_state(...)` is service-role-only. It attaches a private proof and holds the seat while AI/admin review is pending.
- `ticket_approve_order(p_order_id)` is admin-only from the user flow and atomically marks the seat sold, records charity allocation, and creates one QR ticket. Repeated approval returns the already-created ticket.
- `ticket_reject_order(p_order_id, p_reason)` is admin-only and returns a pending seat to available inventory with a recorded reason.
- `ticket_admin_cancel_ticket(p_ticket_id, p_reason)` invalidates the QR while keeping the sold seat unavailable for resale.
- `ticket_verify_ticket(p_ticket_code)` exposes only non-personal ticket validity and event/seat details.
- `ticket_admin_dashboard_stats()` returns admin-only order and inventory counts.
- `ticket_admin_delete_all_events()` is an admin-only, irreversible cleanup operation that removes all ticket rows, orders, seats, and events. The admin UI first closes sales and deletes the related private receipt and event-media files, then calls this transaction. User accounts and homepage banners remain.
- `202611050004_admin_payment_realtime.sql` adds `ticket_orders` to Supabase Realtime so the admin payment panel can display the buyer, order, seat, amount, and signed receipt image as soon as a proof is submitted. The panel also refreshes on visibility changes and polls every 30 seconds as a fallback.
- `ticket_expire_and_cleanup()` is scheduled with `pg_cron` every ten minutes. Wallet access and QR validation stop at exactly `ends_at + 48 hours`; the job marks tickets expired and purges their rows after a 30-day audit window.
- `ticket_admin_set_event_published(...)` controls whether an event is listed publicly.

Administrators are identified by server-managed `auth.users.raw_app_meta_data.role = admin`. Do not use editable user metadata or a browser-only setting for authorization.

## API

### `POST /api/payments/{order_id}/proof`

- Requires `Authorization: Bearer <Supabase access token>`.
- Accepts multipart field `file` (JPEG, PNG, or WebP, max 8 MB).
- Validates the token with Supabase Auth, verifies the order belongs to that user, and accepts only an unexpired `reserved` order.
- Uploads to the private proof bucket through the backend service-role credential.
- Stores a SHA-256 receipt fingerprint so the same image cannot be reused for a second order.
- Asks Gemini Vision to read the visible completed-transfer state, amount, and recipient card suffix.
- Records Gemini's preliminary assessment, but **never automatically approves a payment or creates a ticket**. An administrator must explicitly accept or reject every submitted proof.

### `POST /api/support`

- Requires a valid Supabase access token and reads only the authenticated user's latest order state from Supabase.
- Sends status-only order context (no name or phone) to Gemini with CRP Ticket-specific system instructions. API keys remain server-side.
- Limits chat history to 12 messages of at most 2,000 characters each. AI is instructed not to invent payment status, prices, or contact details.

### `GET /api/verify-ticket?ticket_code=...`

- Calls the database verification RPC using server-side credentials.
- Returns only validity, status, event name, event time, and seat number; it never exposes ticket-owner information.

`GET /health` reports whether required backend integrations are configured without returning secret values.

## Environment variables

Frontend `.env.local` / Vercel:

```text
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
VITE_TICKET_API_URL=
```

Backend `backend/.env` / API host:

```text
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.0-flash
FRONTEND_ORIGINS=
```

The service-role and Gemini keys must only exist in the FastAPI host's secret environment. Uploaded payment proof images and support chat messages are sent to Gemini for processing; the support endpoint sends only status/order context and does not send the customer's name or phone. Disclose both AI-processing flows in the production privacy notice and retain proof images only as long as operationally necessary.

Account creation collects a name and contact phone using an Uzbekistan `+998` prefix, an operator selector (`90`, `91`, `93`, `94`, `95`, `97`, `98`, `99`, `88`, `33`, `50`, `77`, or `20`), then exactly seven subscriber digits. No SMS or Phone Auth is used. Enable Supabase Anonymous Sign-Ins. Anonymous sessions persist only in the current browser/device; without a password, SMS or another recovery method the same account cannot be restored on a different device or after browser storage is cleared. Each profile shows its stable, unique six-digit `123-456` user ID in the account header and ticket wallet.

## Deployment checklist

1. Apply all CRP Ticket migrations in timestamp order to the existing Supabase project and verify both storage buckets and the `pg_cron` expiry job were created. Existing events receive a three-hour default duration; admins should update their actual end times. The short-user-code migration changes existing profile IDs to unique `123-456` values without deleting accounts.
2. Enable Supabase Anonymous Sign-Ins and configure the permitted site URLs. No Phone Auth or SMS provider is needed.
3. Grant the first administrator `app_metadata.role = admin` in the trusted SQL Editor.
4. Add `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `GEMINI_API_KEY` to Vercel Production. Keep the service-role and Gemini keys server-only, then confirm `/api/health`.
5. Set the frontend variables in Vercel for Preview and Production; keep `VITE_TICKET_API_URL` unset in production so the frontend uses the same-origin API.
6. Create an unpublished event, verify seat/invitation inventory and payment card details, then publish it.
7. Test competing reservations for the same seat, duplicate proof submission, manual approval/rejection, QR invalidation, 48-hour expiry, and owner/admin access to the private proof bucket before opening sales.

Existing Supabase database objects are deliberately not dropped. In particular, `202610290006_detective_multi_question_case.sql` remains the five-question, score-based Detective migration and its fictional AN-001 schedule is separate from the ticket schema.
