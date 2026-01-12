#!/usr/bin/env python3
"""
wiki_geo_markup_dg.py

Fetch Wikipedia *markup (wikitext)* for pages that belong to the DG corpus
(i.e., appear in category_pages for DG categories), and store it locally
plus extracted [[wikilinks]].

This fixes the big mistake:
- We DO NOT fetch markup for everything in pages
- We fetch markup ONLY for pages referenced by category_pages for allowed categories

Also includes a tiny "migration" so you never hit:
  sqlite3.OperationalError: table page_markup has no column named rev_timestamp

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
from typing import Any, Dict, List, Optional, Sequence, Tuple

DEFAULT_DB_PATH = "wiki_geometry.sqlite3"
WIKI_API = "https://en.wikipedia.org/w/api.php"

DEFAULT_MIN_DELAY = 0.25
DEFAULT_MAX_DELAY = 0.75
DEFAULT_TTL_DAYS = 120
DEFAULT_BATCH_SIZE = 25

# Must match the ingest include/exclude defaults (can override with CLI)
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
# Schema add-on (with migration)
# -----------------------------

SCHEMA_MARKUP_SQL = """
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS page_markup (
  page_id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  rev_id INTEGER,
  rev_timestamp TEXT,
  content_model TEXT,
  content_format TEXT,
  wikitext TEXT NOT NULL,
  fetched_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_page_markup_expires ON page_markup(expires_at);

CREATE TABLE IF NOT EXISTS page_links (
  page_id INTEGER NOT NULL,
  target_title TEXT NOT NULL,
  target_canonical TEXT NOT NULL,
  namespace TEXT NOT NULL DEFAULT '',
  is_category INTEGER NOT NULL DEFAULT 0,
  is_file INTEGER NOT NULL DEFAULT 0,
  is_special INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(page_id, target_canonical)
);

CREATE INDEX IF NOT EXISTS idx_page_links_page ON page_links(page_id);
CREATE INDEX IF NOT EXISTS idx_page_links_target ON page_links(target_canonical);
"""

def connect(db_path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON;")
    return conn

def ensure_markup_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(SCHEMA_MARKUP_SQL)
    conn.commit()
    migrate_page_markup(conn)

def table_columns(conn: sqlite3.Connection, table: str) -> List[str]:
    rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
    return [str(r["name"]) for r in rows]

def migrate_page_markup(conn: sqlite3.Connection) -> None:
    cols = set(table_columns(conn, "page_markup"))
    # Add missing columns if an older version created the table without them
    if "rev_timestamp" not in cols:
        conn.execute("ALTER TABLE page_markup ADD COLUMN rev_timestamp TEXT")
    if "content_model" not in cols:
        conn.execute("ALTER TABLE page_markup ADD COLUMN content_model TEXT")
    if "content_format" not in cols:
        conn.execute("ALTER TABLE page_markup ADD COLUMN content_format TEXT")
    conn.commit()

# -----------------------------
# HTTP helpers
# -----------------------------

def polite_sleep(min_delay: float, max_delay: float) -> None:
    time.sleep(min_delay + random.random() * max(0.0, (max_delay - min_delay)))

def http_get_json(url: str, headers: Optional[Dict[str, str]] = None, timeout: int = 25, retries: int = 4) -> Dict[str, Any]:
    last_err = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers=headers or {}, method="GET")
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                raw = resp.read().decode("utf-8")
            return json.loads(raw)
        except Exception as e:
            last_err = e
            time.sleep(0.8 * (2 ** attempt))
    raise RuntimeError(f"GET failed after retries: {url}\nLast error: {last_err}")

def api_call(params: Dict[str, str], user_agent: str) -> Dict[str, Any]:
    qs = urllib.parse.urlencode(params)
    url = f"{WIKI_API}?{qs}"
    return http_get_json(url, headers={"User-Agent": user_agent, "Accept": "application/json"})

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
# Wikitext parsing (wikilinks)
# -----------------------------

_WIKILINK_RE = re.compile(r"\[\[([^\[\]\n]+?)\]\]")

def canonicalize_title(title: str) -> str:
    return (title or "").strip().replace(" ", "_")

def normalize_link_target(raw_inside: str) -> Optional[Tuple[str, str, str, int, int, int]]:
    s = (raw_inside or "").strip()
    if not s:
        return None
    if "|" in s:
        s = s.split("|", 1)[0].strip()
    if "#" in s:
        s = s.split("#", 1)[0].strip()
    if not s:
        return None

    # Skip interwiki prefixes like [[de:Foo]] etc (except common namespaces)
    if re.match(r"^[a-z]{2,10}:", s, flags=re.IGNORECASE) and not s.lower().startswith(
        ("category:", "file:", "image:", "special:", "help:", "template:", "portal:")
    ):
        return None

    ns = ""
    is_category = 0
    is_file = 0
    is_special = 0
    if ":" in s:
        prefix, _ = s.split(":", 1)
        ns = prefix.strip()
        px = ns.lower()
        if px == "category":
            is_category = 1
        elif px in ("file", "image"):
            is_file = 1
        elif px == "special":
            is_special = 1

    target_title = s.strip()
    if not target_title:
        return None
    target_canon = canonicalize_title(target_title)
    return (target_title, target_canon, ns, is_category, is_file, is_special)

def extract_wikilinks(wikitext: str) -> List[Tuple[str, str, str, int, int, int]]:
    out: List[Tuple[str, str, str, int, int, int]] = []
    seen: set = set()
    for m in _WIKILINK_RE.finditer(wikitext or ""):
        inner = m.group(1)
        norm = normalize_link_target(inner)
        if not norm:
            continue
        _, canon, _, _, _, _ = norm
        if canon in seen:
            continue
        seen.add(canon)
        out.append(norm)
    return out

# -----------------------------
# Fetch wikitext in batches
# -----------------------------

@dataclass(frozen=True)
class PageResult:
    page_id: int
    title: str
    wikitext: str
    rev_id: Optional[int]
    rev_timestamp: Optional[str]
    content_model: Optional[str]
    content_format: Optional[str]

def fetch_wikitext_batch(page_ids: List[int], user_agent: str) -> Dict[int, PageResult]:
    if not page_ids:
        return {}
    params = {
        "action": "query",
        "format": "json",
        "formatversion": "2",
        "redirects": "1",
        "prop": "revisions",
        "pageids": "|".join(str(x) for x in page_ids),
        "rvslots": "main",
        "rvprop": "content|ids|timestamp|flags",
    }
    data = api_call(params, user_agent=user_agent)
    pages = (data.get("query") or {}).get("pages") or []
    out: Dict[int, PageResult] = {}

    for p in pages:
        pid = int(p.get("pageid", 0) or 0)
        if pid <= 0:
            continue
        if p.get("missing") is not None:
            continue

        title = str(p.get("title") or "")
        revs = p.get("revisions") or []
        if not revs:
            continue

        rev = revs[0] or {}
        rev_id = rev.get("revid")
        rev_ts = rev.get("timestamp")

        slots = rev.get("slots") or {}
        main = slots.get("main") or {}
        wikitext = main.get("content") or ""

        content_model = main.get("contentmodel") or p.get("contentmodel") or None
        content_format = main.get("contentformat") or p.get("contentformat") or None

        out[pid] = PageResult(
            page_id=pid,
            title=title,
            wikitext=wikitext,
            rev_id=int(rev_id) if rev_id is not None else None,
            rev_timestamp=str(rev_ts) if rev_ts is not None else None,
            content_model=str(content_model) if content_model is not None else None,
            content_format=str(content_format) if content_format is not None else None,
        )

    return out

# -----------------------------
# Cache ops
# -----------------------------

def markup_cached_fresh(conn: sqlite3.Connection, page_id: int) -> bool:
    now = int(time.time())
    row = conn.execute(
        "SELECT 1 FROM page_markup WHERE page_id = ? AND expires_at > ? LIMIT 1",
        (page_id, now),
    ).fetchone()
    return row is not None

def upsert_page_markup(
    conn: sqlite3.Connection,
    page_id: int,
    title: str,
    wikitext: str,
    rev_id: Optional[int],
    rev_timestamp: Optional[str],
    content_model: Optional[str],
    content_format: Optional[str],
    ttl_days: int,
) -> None:
    now = int(time.time())
    expires_at = now + ttl_days * 24 * 3600
    conn.execute(
        """
        INSERT INTO page_markup(
          page_id, title, rev_id, rev_timestamp, content_model, content_format, wikitext,
          fetched_at, expires_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(page_id) DO UPDATE SET
          title=excluded.title,
          rev_id=excluded.rev_id,
          rev_timestamp=excluded.rev_timestamp,
          content_model=excluded.content_model,
          content_format=excluded.content_format,
          wikitext=excluded.wikitext,
          fetched_at=excluded.fetched_at,
          expires_at=excluded.expires_at
        """,
        (page_id, title, rev_id, rev_timestamp, content_model, content_format, wikitext, now, expires_at),
    )
    conn.commit()

def clear_page_links(conn: sqlite3.Connection, page_id: int) -> None:
    conn.execute("DELETE FROM page_links WHERE page_id = ?", (page_id,))
    conn.commit()

def insert_page_links(conn: sqlite3.Connection, page_id: int, links: Sequence[Tuple[str, str, str, int, int, int]]) -> None:
    conn.executemany(
        """
        INSERT INTO page_links(
          page_id, target_title, target_canonical, namespace, is_category, is_file, is_special
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(page_id, target_canonical) DO NOTHING
        """,
        [(page_id, t, c, ns, ic, ifi, isp) for (t, c, ns, ic, ifi, isp) in links],
    )
    conn.commit()

# -----------------------------
# IMPORTANT: choose pages from category_pages, not pages
# -----------------------------

def get_dg_page_ids_to_fetch(
    conn: sqlite3.Connection,
    only_expired: bool,
    include_re: re.Pattern,
    exclude_re: re.Pattern,
) -> List[int]:
    """
    Return page_ids that are referenced by allowed DG categories AND page title passes filters.
    """
    # Allowed categories (titles)
    cat_rows = conn.execute("SELECT title FROM categories").fetchall()
    allowed_cats = [str(r["title"]) for r in cat_rows if allowed_title(str(r["title"]), include_re, exclude_re)]

    if not allowed_cats:
        return []

    placeholders = ",".join("?" for _ in allowed_cats)

    # Candidate page_ids from category_pages
    # Then join pages to enforce title filter
    base_sql = f"""
        SELECT DISTINCT p.page_id, p.title
        FROM category_pages cp
        JOIN pages p ON p.page_id = cp.page_id
        WHERE cp.cat_title IN ({placeholders})
          AND p.ns = 0
        ORDER BY p.page_id
    """
    rows = conn.execute(base_sql, allowed_cats).fetchall()

    page_ids = [int(r["page_id"]) for r in rows if allowed_title(str(r["title"]), include_re, exclude_re)]

    if not only_expired:
        return page_ids

    now = int(time.time())
    out: List[int] = []
    for pid in page_ids:
        row = conn.execute(
            "SELECT 1 FROM page_markup WHERE page_id = ? AND expires_at > ? LIMIT 1",
            (pid, now),
        ).fetchone()
        if row is None:
            out.append(pid)
    return out

# -----------------------------
# Run fetch
# -----------------------------

def run_fetch(
    conn: sqlite3.Connection,
    user_agent: str,
    limit: Optional[int],
    ttl_days: int,
    min_delay: float,
    max_delay: float,
    batch_size: int,
    only_expired: bool,
    extract_links: bool,
    include_re: re.Pattern,
    exclude_re: re.Pattern,
) -> None:
    page_ids = get_dg_page_ids_to_fetch(conn, only_expired, include_re, exclude_re)

    if limit is not None:
        page_ids = page_ids[:limit]

    total = len(page_ids)
    if total == 0:
        print("[OK] Nothing to fetch (no pending DG pages or all fresh).")
        return

    ok = 0
    skipped = 0
    failed = 0

    for start in range(0, total, batch_size):
        batch = page_ids[start:start + batch_size]

        if only_expired:
            batch2 = [pid for pid in batch if not markup_cached_fresh(conn, pid)]
            skipped += (len(batch) - len(batch2))
            batch = batch2
            if not batch:
                continue

        try:
            got = fetch_wikitext_batch(batch, user_agent=user_agent)
        except Exception as e:
            failed += len(batch)
            print(f"[FAIL] batch start={start} size={len(batch)} err={e}", file=sys.stderr)
            polite_sleep(min_delay, max_delay)
            continue

        for pid in batch:
            res = got.get(pid)
            if not res:
                failed += 1
                continue

            upsert_page_markup(
                conn=conn,
                page_id=res.page_id,
                title=res.title,
                wikitext=res.wikitext,
                rev_id=res.rev_id,
                rev_timestamp=res.rev_timestamp,
                content_model=res.content_model,
                content_format=res.content_format,
                ttl_days=ttl_days,
            )

            if extract_links:
                links = extract_wikilinks(res.wikitext)
                clear_page_links(conn, res.page_id)
                insert_page_links(conn, res.page_id, links)

            ok += 1

        done = min(start + batch_size, total)
        print(f"[MARKUP] {done}/{total} ok={ok} skipped={skipped} failed={failed}")
        polite_sleep(min_delay, max_delay)

    print(f"[DONE] total={total} ok={ok} skipped={skipped} failed={failed}")

# -----------------------------
# CLI
# -----------------------------

def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Fetch Wikipedia wikitext for DG corpus pages in SQLite and store it.")
    p.add_argument("--db", default=DEFAULT_DB_PATH, help=f"SQLite path (default: {DEFAULT_DB_PATH})")
    p.add_argument("--user-agent", default="LocalMathRef/1.0 (educational; +https://example.invalid)", help="User-Agent header")

    p.add_argument("--create-only", action="store_true", help="Create markup tables and exit")
    p.add_argument("--limit", type=int, default=0, help="Limit number of pages to fetch (0 = no limit)")
    p.add_argument("--ttl-days", type=int, default=DEFAULT_TTL_DAYS, help=f"TTL for cached markup (default: {DEFAULT_TTL_DAYS})")
    p.add_argument("--min-delay", type=float, default=DEFAULT_MIN_DELAY, help="Min delay between requests (seconds)")
    p.add_argument("--max-delay", type=float, default=DEFAULT_MAX_DELAY, help="Max delay between requests (seconds)")
    p.add_argument("--batch-size", type=int, default=DEFAULT_BATCH_SIZE, help=f"API batch size (default: {DEFAULT_BATCH_SIZE})")

    p.add_argument("--include-regex", default=DEFAULT_INCLUDE_REGEX, help="Regex: allow titles if match (case-insensitive)")
    p.add_argument("--exclude-regex", default=DEFAULT_EXCLUDE_REGEX, help="Regex: reject titles if match (case-insensitive)")

    p.add_argument("--no-only-expired", action="store_true",
                   help="Do NOT restrict fetch to expired items (default: only fetch missing/expired)")
    p.add_argument("--no-extract-links", action="store_true",
                   help="Do NOT extract [[wikilinks]]")
    return p.parse_args()

def main() -> None:
    args = parse_args()
    conn = connect(args.db)
    ensure_markup_schema(conn)

    if args.create_only:
        print(f"[OK] Markup tables created/verified (and migrated if needed) in: {args.db}")
        return

    limit = None if int(args.limit) == 0 else int(args.limit)
    only_expired = not args.no_only_expired
    extract_links = not args.no_extract_links

    batch_size = max(1, min(int(args.batch_size), 50))

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
        batch_size=batch_size,
        only_expired=only_expired,
        extract_links=extract_links,
        include_re=include_re,
        exclude_re=exclude_re,
    )

    print(f"[OK] Markup DB ready: {args.db}")

if __name__ == "__main__":
    main()
