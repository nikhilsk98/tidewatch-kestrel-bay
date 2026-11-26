"""Check that the loader can connect to the Neon database."""

import os

import psycopg
from dotenv import load_dotenv

load_dotenv(".env.local")

# Direct (not pooled) connection: better for the loader's bulk inserts.
url = os.environ.get("DATABASE_URL_DIRECT")
if not url:
    raise SystemExit("DATABASE_URL_DIRECT is missing from .env.local")

with psycopg.connect(url) as conn:
    with conn.cursor() as cur:
        cur.execute("SELECT version()")
        print(cur.fetchone()[0])