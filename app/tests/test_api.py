import os
import json
import re
import threading
from urllib.request import Request, urlopen
from werkzeug.serving import make_server
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
import psycopg
from server import SCHEMA, create_app


class PostApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.url = os.environ["TEST_DATABASE_URL"]
        cls.app = create_app(cls.url)
        cls.app.config["TESTING"] = True
        with psycopg.connect(cls.url) as connection:
            connection.execute(SCHEMA)

    def setUp(self):
        with psycopg.connect(self.url) as connection:
            connection.execute("TRUNCATE posts RESTART IDENTITY")
        self.client = self.app.test_client()

    def test_post_persists_across_application_instances_and_has_no_identity(self):
        response = self.client.post("/api/posts", json={"body": "  A little courage today.  "})
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json["body"], "A little courage today.")
        self.assertEqual(set(response.json), {"id", "body", "created_at"})
        self.assertNotIn("Set-Cookie", response.headers)
        other_client = create_app(self.url).test_client()
        self.assertEqual(other_client.get("/api/posts").json["posts"], [response.json])
        with psycopg.connect(self.url) as connection:
            columns = connection.execute("SELECT column_name FROM information_schema.columns WHERE table_name = 'posts'").fetchall()
        self.assertEqual({column[0] for column in columns}, {"id", "body", "created_at"})

    def test_newest_first_pagination_has_no_gaps_or_duplicates(self):
        ids = []
        for number in range(23):
            result = self.client.post("/api/posts", json={"body": f"Synthetic thought {number}"})
            self.assertEqual(result.status_code, 201)
            ids.append(result.json["id"])
        first = self.client.get("/api/posts").json
        second = self.client.get(f"/api/posts?before={first['next_cursor']}").json
        self.assertEqual(len(first["posts"]), 20)
        self.assertEqual([post["id"] for post in first["posts"] + second["posts"]], ids[::-1])
        self.assertIsNone(second["next_cursor"])

    def test_invalid_content_is_rejected_and_not_stored(self):
        for body in [None, [], {}, {"body": None}, {"body": 5}, {"body": ""}, {"body": " \n\t "}, {"body": "x" * 1001}, {"body": "a\x00b"}, {"body": "hello", "author": "name"}]:
            with self.subTest(body=body):
                response = self.client.post("/api/posts", json=body)
                self.assertEqual(response.status_code, 400)
                self.assertIn("error", response.json)
        self.assertEqual(self.client.get("/api/posts").json["posts"], [])
        self.assertEqual(self.client.post("/api/posts", data="not json", content_type="application/json").status_code, 400)
        self.assertEqual(self.client.post("/api/posts", json={"body": "x" * 9000}).status_code, 413)

    def test_unicode_boundary_and_sql_content_are_plain_text(self):
        content = "🌱" * 1000
        self.assertEqual(self.client.post("/api/posts", json={"body": content}, content_type="application/json").status_code, 413)
        # A browser sends UTF-8 rather than JSON's optional ASCII escaping.
        response = self.client.post("/api/posts", data='{"body":"' + content + '"}', content_type="application/json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json["body"], content)
        attack = "<script>alert('x')</script>'; DROP TABLE posts; --"
        self.assertEqual(self.client.post("/api/posts", json={"body": attack}).status_code, 201)
        self.assertEqual(self.client.get("/api/posts").json["posts"][0]["body"], attack)

    def test_invalid_cursors_and_unavailable_database(self):
        for cursor in ["0", "-1", "abc", "9223372036854775808", "1%27", "%D9%A1", "1" * 5000]:
            self.assertEqual(self.client.get(f"/api/posts?before={cursor}").status_code, 400)
        dead = create_app("postgresql://unused:unused@127.0.0.1:1/missing?connect_timeout=1").test_client()
        response = dead.get("/api/posts")
        self.assertEqual(response.status_code, 503)
        self.assertEqual(set(response.json), {"error"})
        self.assertNotIn("unused", response.get_data(as_text=True))

    def test_live_http_serves_built_app_and_posting_flow(self):
        server = make_server("127.0.0.1", 0, self.app)
        worker = threading.Thread(target=server.serve_forever, daemon=True)
        worker.start()
        base = f"http://127.0.0.1:{server.server_port}"
        try:
            with urlopen(base, timeout=5) as response:
                html = response.read().decode()
                self.assertIn('<div id="root">', html)
            assets = re.findall(r'(?:src|href)="(/assets/[^"]+)"', html)
            self.assertTrue(any(asset.endswith(".js") for asset in assets))
            self.assertTrue(any(asset.endswith(".css") for asset in assets))
            for asset in assets:
                with urlopen(base + asset, timeout=5) as response:
                    self.assertEqual(response.status, 200)
                    self.assertGreater(len(response.read()), 0)
            with urlopen(base + "/api/health", timeout=5) as response:
                self.assertEqual(json.load(response), {"status": "ok"})
            request = Request(base + "/api/posts", data=json.dumps({"body": "Synthetic HTTP thought"}).encode(), headers={"Content-Type": "application/json"})
            with urlopen(request, timeout=5) as response:
                self.assertEqual(response.status, 201)
                post = json.load(response)
            with urlopen(base + "/api/posts", timeout=5) as response:
                self.assertEqual(json.load(response)["posts"], [post])
        finally:
            server.shutdown()
            worker.join(timeout=5)
            server.server_close()

    def test_health_and_security_headers(self):
        response = self.client.get("/api/health")
        self.assertEqual(response.json, {"status": "ok"})
        self.assertEqual(response.headers["X-Content-Type-Options"], "nosniff")
        self.assertEqual(response.headers["Cache-Control"], "no-store")
        self.assertIn("frame-ancestors 'none'", response.headers["Content-Security-Policy"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
