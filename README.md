# Unsaid

A responsive anonymous posting app built with **React**, **Flask**, and
**PostgreSQL**. Share a thought without an account and browse the newest posts.

## Features

- Publish text posts of up to 1,000 Unicode characters.
- Browse newest posts first and load older posts.
- No accounts, profiles, or public author identities.
- Input validation, loading indicators, and recoverable error states.
- Responsive layout and an accessible privacy dialog.

## Quick start with Docker

Install Docker with Compose, then run from the repository root:

```sh
cd app
cp .env.example .env
```

Set `POSTGRES_PASSWORD` in `.env` to a fresh alphanumeric password, then run:

```sh
docker compose up --build
```

Open **http://localhost:5000**. On PowerShell, use
`Copy-Item .env.example .env` instead of `cp`.

Posts persist in a Docker volume. Stop the app with `docker compose down`.

## Run without Docker

Requires Node.js 22+ and Python 3.12+. From the repository root:

```sh
cd app
npm ci
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r backend/requirements.txt
npm run local
```

On Windows PowerShell, create the environment with `python -m venv .venv`
and activate it with `.venv\Scripts\Activate.ps1`.

Open **http://localhost:5000**. This mode starts a bundled PostgreSQL server
and saves posts in `app/.runtime/local-postgres`. Stop it with Ctrl+C.

For separate React/Flask development servers or an existing PostgreSQL
database, see the [application setup guide](app/README.md#local-development).

## Tests

After installing the Node and Python dependencies, run from the repository
root:

```sh
pullboard test app/tests/integration.test.mjs
```

Outside Pullboard, run `npm run check` from `app/`.

The check builds React and runs eight tests against a temporary PostgreSQL
database, covering persistence, ordering, pagination, validation, Unicode
limits, anonymous response fields, security headers, database outages, and
live HTTP delivery of the page, assets, and posting API.

## Project structure

```text
app/
  backend/       Flask JSON API and PostgreSQL schema
  frontend/      React UI and styles
  scripts/       Local server and verification commands
  tests/         API integration and live HTTP checks
  compose.yaml   Local Docker services
```

## Privacy and current limits

Posts are public and cannot currently be edited or deleted through the app.
The database stores only post ID, text, and timestamp. This does not guarantee
network anonymity: hosts and networks may retain connection logs. Avoid
posting identifying details.

Public hosting is not configured. See the [deployment notes](app/README.md#privacy-and-deployment)
before exposing the app publicly.
