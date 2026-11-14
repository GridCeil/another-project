import os
from pathlib import Path

import click
import psycopg
from flask import Flask, jsonify, request, send_from_directory
from psycopg.rows import dict_row
from werkzeug.exceptions import HTTPException

SCHEMA = """
CREATE TABLE IF NOT EXISTS posts (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
"""


def create_app(database_url=None):
    app = Flask(__name__, static_folder=None)
    app.config.update(
        DATABASE_URL=database_url or os.environ.get("DATABASE_URL"),
        MAX_CONTENT_LENGTH=8192,
    )
    if not app.config["DATABASE_URL"]:
        raise RuntimeError("Set DATABASE_URL to a PostgreSQL connection URL.")

    def connect():
        return psycopg.connect(app.config["DATABASE_URL"], row_factory=dict_row)

    @app.cli.command("init-db")
    def init_db():
        with connect() as connection:
            connection.execute(SCHEMA)
        click.echo("PostgreSQL schema is ready.")

    def serialize(post):
        return {
            "id": str(post["id"]),
            "body": post["body"],
            "created_at": post["created_at"].isoformat(),
        }

    @app.get("/api/posts")
    def list_posts():
        before = request.args.get("before")
        if before is not None and (len(before) > 19 or not before.isascii() or not before.isdigit() or not 0 < int(before) < 2**63):
            return jsonify(error="Invalid page cursor."), 400
        with connect() as connection:
            if before:
                rows = connection.execute(
                    "SELECT id, body, created_at FROM posts WHERE id < %s ORDER BY id DESC LIMIT 21",
                    (int(before),),
                ).fetchall()
            else:
                rows = connection.execute(
                    "SELECT id, body, created_at FROM posts ORDER BY id DESC LIMIT 21"
                ).fetchall()
        posts = rows[:20]
        return jsonify(posts=[serialize(post) for post in posts], next_cursor=str(posts[-1]["id"]) if len(rows) > 20 else None)

    @app.post("/api/posts")
    def create_post():
        data = request.get_json(silent=True)
        if not isinstance(data, dict) or set(data) != {"body"} or not isinstance(data.get("body"), str):
            return jsonify(error="Send a JSON object with one text field: body."), 400
        body = data["body"].strip()
        if not body or len(body) > 1000 or "\x00" in body:
            return jsonify(error="Write between 1 and 1,000 characters."), 400
        with connect() as connection:
            post = connection.execute(
                "INSERT INTO posts (body) VALUES (%s) RETURNING id, body, created_at", (body,)
            ).fetchone()
        return jsonify(serialize(post)), 201

    @app.get("/api/health")
    def health():
        with connect() as connection:
            connection.execute("SELECT 1 FROM posts LIMIT 1")
        return jsonify(status="ok")

    @app.errorhandler(psycopg.Error)
    def database_error(error):
        # Connection strings and submitted text must never enter application logs.
        app.logger.error("Database request failed (%s)", type(error).__name__)
        return jsonify(error="Posts are temporarily unavailable. Please try again."), 503

    @app.errorhandler(HTTPException)
    def http_error(error):
        return jsonify(error="Your post is too large." if error.code == 413 else error.description), error.code

    @app.after_request
    def security_headers(response):
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
        if request.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        return response

    dist = Path(__file__).resolve().parents[1] / "frontend" / "dist"

    @app.get("/")
    def index():
        return send_from_directory(dist, "index.html")

    @app.get("/assets/<path:filename>")
    def assets(filename):
        return send_from_directory(dist / "assets", filename)

    return app
