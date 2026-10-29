# ANONI

ANONI is a React/Vite application using Supabase Auth and PostgreSQL for account profiles, balances, moderation status, shop ownership, and the global XP leaderboard.

## Supabase setup

1. Create a Supabase project and apply `supabase/migrations/202607150001_profiles_auth.sql` in the Supabase SQL Editor. For an existing project, also apply later migration files in timestamp order.
2. In **Authentication → URL Configuration**, set the production site URL to `https://anoni-app.vercel.app`; add `http://localhost:5173` and the production URL to the redirect allow list.
3. In **Authentication → Sign In / Providers**, enable **Anonymous Sign-Ins**. Participants then enter only a nickname and age; they do not need email or password.
4. For local development, copy `.env.example` to `.env.local` and set `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, and `VITE_GEMINI_API_KEY`. The publishable key is intended for browser use; never put a Supabase secret/service-role key in a `VITE_` variable.
5. Add the `VITE_SUPABASE_*` variables and `VITE_GEMINI_API_KEY` in the Vercel project’s environment settings for Preview and Production, then redeploy. Gemini AI features require a valid Google AI Studio API key.
6. For a recoverable admin login across devices, create a dedicated email/password user in **Authentication → Users**, then grant its email `app_metadata.role = admin` using the trusted SQL Editor:

   ```sql
   update auth.users
   set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
   where lower(email) = lower('your-admin-email@example.com');
   ```

   Use a unique, strong password. The app’s login screen includes **Admin hisobim bilan kirish**. TOTP/MFA challenge enforcement is not implemented in the app yet, so do not treat enabling an MFA factor alone as protecting admin actions. Never use a nickname/age combination or client-side flag as administrator credentials; admin database actions independently verify the server-managed role.

The initial migration creates the profile-on-signup trigger, unique public IDs, row-level security policies, guarded reward/shop/admin functions, and the Realtime publication entry for profile changes. The admin visibility migration adds global leaderboard hiding and permanent PRO support. The test-creation pause migration disables new tests until 2026-11-03 18:00 Uzbekistan time while leaving existing tests available. The admin delete-account migration adds a guarded, irreversible user deletion action; it cannot delete the currently signed-in admin. Apply all migration files in timestamp order. Apply `supabase/migrations/202610290001_iq_test_and_battles.sql` for server-checked IQ tests, saved attempts, IQ battles, and the separate TOP-100 ranking, then apply `supabase/migrations/202610290002_private_profile_access_and_challenge_votes.sql` before deploying the client changes. Apply `supabase/migrations/202610290003_realtime_public_leaderboard.sql` to restore global live ranking updates without exposing private profile fields. The IQ migration can be rerun safely if SQL Editor reports that one of its tables already exists; existing question IDs are preserved and missing questions are inserted. The profile migration removes direct profile-table reads, so it must be applied before the updated client starts using its restricted profile RPC.

Apply `supabase/migrations/202610290004_telegram_join_reward.sql` to enable the one-time 500 Coin Telegram channel reward. The site records the claim server-side per account, but this flow currently relies on the user's confirmation; it does not automatically verify Telegram membership.

Apply `supabase/migrations/202610290005_weekly_detective.sql` to add the separate Gold balance and secure weekly Detective investigations. Schedule approved cases from the admin panel; all scheduled times are interpreted in `Asia/Tashkent`. The public RPC only returns evidence unlocked by server time, accepts one Saturday answer per account, and awards Gold atomically. Past cases and answer statistics are available only in the admin panel, not in a public archive. Admins must add verifiable sources before scheduling a case.

## Current data boundaries

Account identity, age, public ID, XP, Coin and Gold balances, PRO/ban dates, owned shop status, completed IQ results, and Detective answers are cloud-backed. Private profile columns are available only through the authenticated app RPC for the current user or an admin; other users receive a restricted public profile shape. IQ question answers remain in the database and are returned only as a correctness result; the browser receives question text and choices, not the answer key. In-progress IQ attempts and battle results are tied to the authenticated profile. Detective answer keys and unreleased clues remain server-side until the permitted stage. Profile state refreshes through the authenticated app-data RPC and the current user's profile-change events. Daily login, daily test-creation XP, verified daily challenge votes/rewards, Detective Gold rewards, shop purchases, and admin updates are handled by database functions rather than direct browser updates.

Anonymous accounts persist in the same browser/device through the Supabase session. Nickname and age are not credentials: using the same nickname on another device creates a separate profile, and clearing browser data can make the original anonymous account unrecoverable. Do not sign out if you want to keep access to that anonymous account.

Test content and attempts, avatar images, challenge voting totals, and other presentation-only progress are still browser-local. Test completion/author rewards are not issued as cloud balance changes until tests and attempts are migrated to the database. Paid Coin/PRO checkout is not connected to a payment provider and therefore does not grant purchased currency or subscriptions.

## Run and validate

```sh
npm install
npm run dev
npm run lint
npm run build
```
