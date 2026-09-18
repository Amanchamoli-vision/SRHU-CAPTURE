# Campus Capture API (FastAPI + MongoDB)

The backend stores everything in one MongoDB database: users and their
credentials, events, media and document metadata, notifications, generated
reports, and the uploaded file bytes themselves (GridFS). Login tokens are JWTs
issued by this service. Outbound email (verification links, password resets,
Dean credentials, event decisions) goes over SMTP.

## Setup

```powershell
cd backend
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
copy .env.example .env      # then edit the values
```

Required settings in `.env`:

| Variable | Purpose |
| --- | --- |
| `MONGODB_URI` | Connection string, e.g. `mongodb://localhost:27017` |
| `MONGODB_DB_NAME` | Database name (default `campus_capture`) |
| `JWT_SECRET_KEY` | Long random secret used to sign login tokens (32+ chars recommended) |
| `FRONTEND_URL` | Public origin of the React app, used in email links and CORS |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM_EMAIL` | Mail server used for all outbound email |

Optional: `REQUIRE_EMAIL_VERIFICATION=false` lets new accounts sign in without
confirming their email (handy before SMTP is configured). `SMTP_USE_SSL=true`
switches from STARTTLS (587) to implicit TLS (465).

## First run

```powershell
.venv\Scripts\python scripts\init_db.py                       # create indexes
.venv\Scripts\python scripts\create_superadmin.py --email superadmin@example.com --name "Super Admin"
.venv\Scripts\python run.py                                   # http://localhost:8000
```

`run.py` listens on `0.0.0.0:8000`, so phones and laptops on the same network
can reach the API through the frontend's LAN address. If you start uvicorn by
hand, pass the host explicitly. Without it uvicorn binds to 127.0.0.1 only and
every other device gets "Failed to fetch" on login and signup:

```powershell
.venv\Scripts\uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Settings are read from `.env` at startup; restart the server after editing it.

`create_superadmin.py` prompts for a password when `--password` /
`SUPERADMIN_PASSWORD` is not supplied. Deans are created from the superadmin
console; teachers register themselves and confirm their email.

### Upgrading from the `admin` role

The top role used to be called `admin`. Login now rejects that value, so run
the migration before (or together with) deploying this version. It is safe to
run more than once:

```powershell
.venv\Scripts\python scripts\migrate_admin_to_superadmin.py
```

## Useful commands

```powershell
.venv\Scripts\python -m unittest discover tests      # unit tests (no DB or SMTP needed)
.venv\Scripts\python scripts\smtp_diagnostic.py      # check SMTP reachability + credentials
```

`GET /health` reports whether MongoDB answers and whether SMTP is configured.

## Collections

| Collection | Contents |
| --- | --- |
| `users` | `name`, `email` (unique), `password_hash`, `role` (`teacher` / `dean` / `superadmin`), verification and reset token hashes |
| `events` | Event submissions keyed by `teacher_id` with the lifecycle `status` |
| `event_media`, `event_documents` | Metadata for uploads; bytes live in the `uploads` GridFS bucket and are served from `/files/{id}` |
| `notifications` | In-app notifications per `user_id` |
| `event_reports` | One generated report per `event_id` |
