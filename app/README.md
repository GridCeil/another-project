# Unsaid

A responsive anonymous text feed built with React, Flask, and PostgreSQL. No accounts or public author identities. Readers can publish thoughts up to 1,000 Unicode characters, browse newest first, and load earlier posts.

The API trims leading and trailing whitespace before validating the 1–1,000 Unicode code point limit and storing a post. Whitespace-only posts are rejected; internal spacing and line breaks are preserved. The browser counter counts the current draft, including surrounding whitespace.

## Run with Docker

Install Docker with Compose, then from this `app` directory:

```sh
cp .env.example .env
# Edit .env and replace POSTGRES_PASSWORD with a fresh alphanumeric password.
docker compose up --build
```

On Windows PowerShell, use `Copy-Item .env.example .env` for the first line. Open **http://localhost:5000**. PostgreSQL uses a persistent named volume; `docker compose down` stops the app without removing posts. The database port is not exposed. The app binds to localhost by default.

## Local development

For a single-command local server without installing PostgreSQL or Docker, install Node 22+, Python 3.12+, run `npm ci`, create and activate `.venv`, and run `python -m pip install -r backend/requirements.txt`. Then run `npm run local`. It builds React, starts a loopback-only bundled PostgreSQL server, initializes the schema, and serves the app at **http://localhost:5000**. Posts persist in the ignored `.runtime/local-postgres` directory. Stop with Ctrl+C. Set `PORT` or `LOCAL_DB_PORT` if the defaults 5000/55432 are busy. This local convenience mode does not seed fictional posts.

Requires Node 22+, Python 3.12+, and PostgreSQL 16+. Create a database called `unsaid`, then:

```sh
npm ci
python -m venv .venv
# Activate .venv with your shell's activation command.
python -m pip install -r backend/requirements.txt
export DATABASE_URL='postgresql://USER:PASSWORD@127.0.0.1:5432/unsaid'
python -m flask --app backend.server:create_app init-db
python -m flask --app backend.server:create_app run --port 5000
```

For PowerShell, activate with `.venv\Scripts\Activate.ps1` and set the connection with `$env:DATABASE_URL = 'postgresql://USER:PASSWORD@127.0.0.1:5432/unsaid'`. In a second terminal, run `npm run dev` and visit **http://localhost:5173**. Vite proxies `/api` to Flask. For a single-server build, run `npm run build`, then `waitress-serve --host=127.0.0.1 --port=5000 --call backend.server:create_app`.

## Checks

In this repository, run from its root:

```sh
pullboard test app/tests/integration.test.mjs
```

The check builds React and starts a disposable real PostgreSQL instance on a free loopback port, then exercises Flask through its HTTP test client. It verifies persistence across application instances, the author-free response/schema, ordering and pagination, invalid content and cursors, Unicode limits, injection payloads as plain text, database outages, response security headers, and a live HTTP smoke check of the built page, JavaScript/CSS assets, health endpoint, and posting flow. The test database is deleted after shutdown. `node app/scripts/check.mjs` is the board gate; outside Pullboard, use `npm run check` from `app`. Set `PYTHON` to a Python executable if it is not discoverable. No external database or Docker is needed for the checks.

## Privacy and deployment

The application stores only post ID, text, and timestamp. It does not set cookies or record IP addresses, names, emails, or device identifiers in its database. React renders all post text as text, SQL values are parameterized, and the server validates every submission.

Posts are public and cannot currently be edited or deleted through the UI. A privacy dialog is available from the header and explains these limits. This does not provide network anonymity: hosting providers, reverse proxies, and networks may log connection information. Do not share identifying details. Before opening a public deployment, configure HTTPS, abuse controls, a moderation/deletion process, backups, and your hosting access-log retention policy. Database credentials belong in deployment secrets. The included Docker setup is for local use; no hosted service has been configured.

## Dependencies

- React and React DOM provide the interactive UI; React DOM brings the scheduler runtime.
- Vite builds and serves the frontend; its build tools include Rollup and esbuild.
- Flask provides HTTP routing, JSON responses, and CLI commands; it brings Werkzeug, Jinja2, Click, Blinker, ItsDangerous, and MarkupSafe.
- Psycopg provides parameterized PostgreSQL access; its binary extra bundles the PostgreSQL client library.
- Waitress serves Flask without the development server in the container and local production mode.
- `embedded-postgres` is development-only: it brings platform PostgreSQL binaries and the Node PostgreSQL client to make isolated integration checks reproducible. It is also used by the optional local convenience server; Docker uses its own PostgreSQL service.

Versions are pinned in `backend/requirements.txt` and resolved in `package-lock.json`.
