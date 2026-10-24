# anoni-app backend

## Run locally

From the `backend` directory, create and activate a virtual environment, then install dependencies:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
uvicorn main:app --reload
```

`FRONTEND_ORIGINS` can contain comma-separated exact origins for custom domains; localhost is allowed by default, and HTTPS `*.vercel.app` deployment origins are accepted automatically.

The API root and `/health` endpoint return basic status responses. `database.py` exports a SQLite engine, SQLAlchemy session factory, declarative base, and `get_db` dependency.
