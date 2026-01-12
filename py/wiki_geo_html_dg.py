#!/usr/bin/env python3
"""
wiki_geo_html_dg.py

Fetch Wikipedia *rendered HTML* (Parsoid HTML) for pages that belong to the DG corpus
(i.e., appear in category_pages for allowed DG categories), and store it locally.

This complements your wikitext cache:
- page_markup  => wikitext (action=query revisions)
- page_html    => rendered HTML (REST /page/html/{title})

Default behavior is restartable:
- fetch ONLY missing/expired HTML (TTL-based)
- use --no-only-expired to force refresh everything

No external deps.
"""

import argparse
import json
import random
import re
import sqlite3
import sys
import time
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

DEFAULT_DB_PATH = "wiki_geometry.sqlite3"

# Parsoid HTML endpoint (renders like Wikipedia page)
WIKI_HTML_BASE = "https://en.wikipedia.org/api/rest_v1/page/html/"

DEFAULT_MIN_DELAY = 0.25
DEFAULT_MAX_DELAY = 0.75
DEFAULT_TTL_DAYS = 30  # HTML changes more often than summaries; adjust as you like.

# Must match your DG include/exclude defaults (override via CLI)
DEFAULT_INCLUDE_REGEX = (
    r"(differential geometry|riemannian|pseudo-?riemannian|manifold|"
    r"bundle|connection|tensor|curvature|geodesic|surface|minimal surface|"
    r"gauss|gaussian|shape operator|second fundamental form|first fundamental form|"
    r"levi-?civita|christoffel|metric|isometry|immersion|embedding|"
    r"frenet|torsion|principal curvature|mean curvature|gauss map|"
    r"symplectic|contact geometry|foliation|submanifold|"
    r"affine connection|cartan|moving frame)"
)

DEFAULT_EXCLUDE_REGEX = (
    r"(border(s)?|treaty|war|country|countries|politics|election|"
    r"black hole|fiction|astronomy|latinia|bosnia|herzegovina|russia|"
    r"teleportation|tachyon|quasar|planet|exoplanet|wave event|"
    r"biography|born|death|football|basketball)"
)

# -----------------------------
# Schema add-on (HTML cache)
# -----------------------------

SCHEMA_HTML_SQL = """
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS page_html (
  page_id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  html TEXT NOT NULL,
  fetched_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  source_url TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_page_html_expires ON page_html(expires_at);
"""

def connect(db_path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON;")
    return conn

def ensure_html_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(SCHEMA_HTML_SQL)
    conn.commit()

# -----------------------------
# HTTP helpers
# -----------------------------

def polite_sleep(min_delay: float, max_delay: float) -> None:
    time.sleep(min_delay + random.random() * max(0.0, (max_delay - min_delay)))

def http_get_text(url: str, headers: Optional[Dict[str, str]] = None, timeout: int = 30, retries: int = 4) -> str:
    last_err = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers=headers or {}, method="GET")
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                raw = resp.read().decode("utf-8", errors="replace")
            return raw
        except Exception as e:
            last_err = e
            time.sleep(0.8 * (2 ** attempt))
    raise RuntimeError(f"GET failed after retries: {url}\nLast error: {last_err}")

def fetch_parsoid_html(title: str, user_agent: str) -> str:
    # REST expects URL-encoded title (spaces ok; we encode safely)
    encoded = urllib.parse.quote(title, safe="")
    url = f"{WIKI_HTML_BASE}{encoded}"
    return http_get_text(url, headers={"User-Agent": user_agent, "Accept": "text/html"})

# -----------------------------
# Filters
# -----------------------------

def mk_re(rx: str) -> re.Pattern:
    return re.compile(rx, re.IGNORECASE)

def allowed_title(title: str, include_re: re.Pattern, exclude_re: re.Pattern) -> bool:
    t = title or ""
    if exclude_re.search(t):
        return False
    return include_re.search(t) is not None

# -----------------------------
# DG page selection (category_pages + filtered categories + filtered page titles)
# -----------------------------

def get_allowed_categories(conn: sqlite3.Connection, include_re: re.Pattern, exclude_re: re.Pattern) -> List[str]:
    cat_rows = conn.execute("SELECT title FROM categories").fetchall()
    allowed = []
    for r in cat_rows:
        t = str(r["title"])
        if allowed_title(t, include_re, exclude_re):
            allowed.append(t)
    return allowed

def html_cached_fresh(conn: sqlite3.Connection, page_id: int) -> bool:
    now = int(time.time())
    row = conn.execute(
        "SELECT 1 FROM page_html WHERE page_id = ? AND expires_at > ? LIMIT 1",
        (page_id, now),
    ).fetchone()
    return row is not None

def get_dg_pages_to_fetch(
    conn: sqlite3.Connection,
    only_expired: bool,
    include_re: re.Pattern,
    exclude_re: re.Pattern,
) -> List[Tuple[int, str]]:
    """
    Returns list of (page_id, title) for DG pages.
    If only_expired=True: only those missing/expired in page_html.
    """
    allowed_cats = get_allowed_categories(conn, include_re, exclude_re)
    if not allowed_cats:
        return []

    placeholders = ",".join("?" for _ in allowed_cats)

    rows = conn.execute(
        f"""
        SELECT DISTINCT p.page_id, p.title
        FROM category_pages cp
        JOIN pages p ON p.page_id = cp.page_id
        WHERE cp.cat_title IN ({placeholders})
          AND p.ns = 0
        ORDER BY p.page_id
        """,
        allowed_cats,
    ).fetchall()

    # Also filter page titles (this kills “border”, “treaty”, etc. even if category leaked)
    pages = [(int(r["page_id"]), str(r["title"])) for r in rows if allowed_title(str(r["title"]), include_re, exclude_re)]

    if not only_expired:
        return pages

    out: List[Tuple[int, str]] = []
    for pid, title in pages:
        if not html_cached_fresh(conn, pid):
            out.append((pid, title))
    return out

# -----------------------------
# Cache write
# -----------------------------

def upsert_page_html(conn: sqlite3.Connection, page_id: int, title: str, html: str, ttl_days: int) -> None:
    now = int(time.time())
    expires_at = now + ttl_days * 24 * 3600
    # Provide a stable source link too
    source_url = f"https://en.wikipedia.org/wiki/{title.replace(' ', '_')}"
    conn.execute(
        """
        INSERT INTO page_html(page_id, title, html, fetched_at, expires_at, source_url)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(page_id) DO UPDATE SET
          title=excluded.title,
          html=excluded.html,
          fetched_at=excluded.fetched_at,
          expires_at=excluded.expires_at,
          source_url=excluded.source_url
        """,
        (page_id, title, html, now, expires_at, source_url),
    )
    conn.commit()

# -----------------------------
# Run
# -----------------------------

def run_fetch(
    conn: sqlite3.Connection,
    user_agent: str,
    limit: Optional[int],
    ttl_days: int,
    min_delay: float,
    max_delay: float,
    only_expired: bool,
    include_re: re.Pattern,
    exclude_re: re.Pattern,
) -> None:
    items = get_dg_pages_to_fetch(conn, only_expired, include_re, exclude_re)
    if limit is not None:
        items = items[:limit]

    total = len(items)
    if total == 0:
        print("[OK] Nothing to fetch (no pending DG HTML pages or all fresh).")
        return

    ok = 0
    skipped = 0
    failed = 0

    for idx, (pid, title) in enumerate(items, start=1):
        if only_expired and html_cached_fresh(conn, pid):
            skipped += 1
            continue

        try:
            html = fetch_parsoid_html(title, user_agent=user_agent)
            upsert_page_html(conn, pid, title, html, ttl_days=ttl_days)
            ok += 1
        except Exception as e:
            failed += 1
            print(f"[FAIL] page_id={pid} title='{title}' err={e}", file=sys.stderr)

        if idx % 25 == 0 or idx == total:
            print(f"[HTML] {idx}/{total} ok={ok} skipped={skipped} failed={failed}")

        polite_sleep(min_delay, max_delay)

    print(f"[DONE] total={total} ok={ok} skipped={skipped} failed={failed}")

# -----------------------------
# CLI
# -----------------------------

def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Fetch Wikipedia rendered HTML (Parsoid) for DG corpus pages and store it.")
    p.add_argument("--db", default=DEFAULT_DB_PATH, help=f"SQLite path (default: {DEFAULT_DB_PATH})")
    p.add_argument("--user-agent", default="LocalMathRef/1.0 (educational; +https://example.invalid)", help="User-Agent header")

    p.add_argument("--create-only", action="store_true", help="Create page_html table and exit")
    p.add_argument("--limit", type=int, default=0, help="Limit number of pages to fetch (0 = no limit)")
    p.add_argument("--ttl-days", type=int, default=DEFAULT_TTL_DAYS, help=f"TTL for cached HTML (default: {DEFAULT_TTL_DAYS})")
    p.add_argument("--min-delay", type=float, default=DEFAULT_MIN_DELAY, help="Min delay between requests (seconds)")
    p.add_argument("--max-delay", type=float, default=DEFAULT_MAX_DELAY, help="Max delay between requests (seconds)")

    p.add_argument("--include-regex", default=DEFAULT_INCLUDE_REGEX, help="Regex: allow titles if match (case-insensitive)")
    p.add_argument("--exclude-regex", default=DEFAULT_EXCLUDE_REGEX, help="Regex: reject titles if match (case-insensitive)")

    p.add_argument("--no-only-expired", action="store_true",
                   help="Do NOT restrict fetch to expired items (default: only fetch missing/expired)")

    return p.parse_args()

def main() -> None:
    args = parse_args()
    conn = connect(args.db)
    ensure_html_schema(conn)

    if args.create_only:
        print(f"[OK] HTML table created/verified in: {args.db}")
        return

    limit = None if int(args.limit) == 0 else int(args.limit)
    only_expired = not args.no_only_expired

    min_delay = float(args.min_delay)
    max_delay = float(args.max_delay)
    if max_delay < min_delay:
        max_delay = min_delay

    include_re = mk_re(args.include_regex)
    exclude_re = mk_re(args.exclude_regex)

    run_fetch(
        conn=conn,
        user_agent=args.user_agent,
        limit=limit,
        ttl_days=int(args.ttl_days),
        min_delay=min_delay,
        max_delay=max_delay,
        only_expired=only_expired,
        include_re=include_re,
        exclude_re=exclude_re,
    )

    print(f"[OK] HTML cache ready: {args.db}")

if __name__ == "__main__":
    main()
