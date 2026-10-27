# ANONI

ANONI is a React/Vite application using Supabase Auth and PostgreSQL for account profiles, balances, moderation status, shop ownership, and the global XP leaderboard.

## Supabase setup

1. Create a Supabase project and apply `supabase/migrations/202607150001_profiles_auth.sql` in the Supabase SQL Editor.
2. In **Authentication → URL Configuration**, set the production site URL to `https://anoni-app.vercel.app`; add `http://localhost:5173` and the production URL to the redirect allow list.
3. In **Authentication → Sign In / Providers**, enable **Anonymous Sign-Ins**. Participants then enter only a nickname and age; they do not need email or password.
4. For local development, copy `.env.example` to `.env.local` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. The publishable key is intended for browser use; never put a Supabase secret/service-role key in a `VITE_` variable.
5. Add the same two `VITE_SUPABASE_*` variables in the Vercel project’s environment settings for Preview and Production, then redeploy.
6. To grant administrator access, set `app_metadata.role` to `admin` for the account using a trusted Supabase administrative tool. Do not use editable user metadata or a client-side flag for authorization. Admin database actions independently verify this role.

The migration creates the profile-on-signup trigger, unique public IDs, row-level security policies, guarded reward/shop/admin functions, and the Realtime publication entry for profile changes. Profile reads require an authenticated user.

## Current data boundaries

Account identity, age, public ID, XP, Coin balance, PRO/ban dates, and owned shop status are cloud-backed. The leaderboard and profile updates refresh through Supabase Realtime. Daily login, daily test-creation XP, challenge rewards, shop purchases, and admin updates are handled by database functions rather than direct browser updates.

Anonymous accounts persist in the same browser/device through the Supabase session. Nickname and age are not credentials: using the same nickname on another device creates a separate profile, and clearing browser data can make the original anonymous account unrecoverable. Do not sign out if you want to keep access to that anonymous account.

Test content and attempts, avatar images, challenge voting totals, and other presentation-only progress are still browser-local. Test completion/author rewards are not issued as cloud balance changes until tests and attempts are migrated to the database. Paid Coin/PRO checkout is not connected to a payment provider and therefore does not grant purchased currency or subscriptions.

## Run and validate

```sh
npm install
npm run dev
npm run lint
npm run build
```
