# CRP Ticket API

The FastAPI service validates Supabase access tokens, reads payment proofs from the private Supabase Storage bucket, and asks Gemini Vision to read the transfer amount and recipient card suffix. The browser uploads images directly to Storage, so the serverless API only receives a small JSON request. Gemini provides preliminary evidence only; every order stays in the admin review queue and only an authenticated administrator can approve it and issue a ticket. The authenticated `/api/support` endpoint also provides CRP Ticket-specific Gemini help, and `/api/verify-ticket` checks QR tickets through a restricted database RPC.

## Local setup

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
uvicorn main:app --reload
```

Set `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` in `backend/.env`. The service-role key and Gemini key are backend-only secrets and must never be added to a `VITE_` variable or committed. `FRONTEND_ORIGINS` is a comma-separated allow-list for local and custom frontend origins; HTTPS `*.vercel.app` domains are also allowed.

Set `VITE_TICKET_API_URL=http://localhost:8000` in the frontend `.env.local`. The `/health` endpoint reports whether server-side Supabase and Gemini configuration is present without exposing key values.

## Deploy on Vercel

Vercel serves this FastAPI app alongside the Vite frontend through `api/[endpoint].py` and `api/payments/[order_id]/proof.py`. The health check is available at `/api/health`. The frontend calls `/api/...` on the same origin in production; leave `VITE_TICKET_API_URL` unset in Vercel.

Add these variables to the Vercel project's Production environment:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY`
- `GEMINI_MODEL` (optional; defaults to `gemini-2.0-flash`)

Keep the service-role and Gemini keys server-only; never prefix them with `VITE_`. The receipt image is stored directly in the private Supabase Storage bucket before its path is sent to this API.
