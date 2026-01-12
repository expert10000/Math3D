#!/usr/bin/env python3
"""
wiki_geo_ingest_dg.py  (DG-ONLY, FILTERED, RESTARTABLE)

Crawl Wikipedia category tree(s) and store:
- categories (DG subtree)
- category_edges
- pages (ns=0)
- category_pages
- crawl_state

Key differences vs your original:
- Default root is ONLY "Differential geometry"
- Hard include/exclude regex filters for categories + pages to prevent "drift"
- Category-driven corpus: if a category fails filters, we DO NOT expand it.

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
from typing import Any, Dict, List, Optional, Set, Tuple

# -----------------------------
# Defaults
# -----------------------------

DEFAULT_DB_PATH = "wiki_geometry.sqlite3"

WIKI_API = "https://en.wikipedia.org/w/api.php"

DEFAULT_MIN_DELAY = 0.25
DEFAULT_MAX_DELAY = 0.75

DEFAULT_MAX_DEPTH = 4
DEFAULT_MAX_PAGES = 20000
DEFAULT_MAX_CATS = 5000

# Default root: DG only
DEFAULT_ROOT_CATEGORIES = [
    "Differential geometry",
]

# DG-ish include patterns (category title OR page title must match at least one)
DEFAULT_INCLUDE_REGEX = (
    r"(differential geometry|riemannian|pseudo-?riemannian|manifold|"
    r"bundle|connection|tensor|curvature|geodesic|surface|minimal surface|"
    r"gauss|gaussian|shape operator|second fundamental form|first fundamental form|"
    r"levi-?civita|christoffel|metric|isometry|immersion|embedding|"
    r"frenet|torsion|principal curvature|mean curvature|gauss map|"
    r"symplectic|contact geometry|foliation|submanifold|"
    r"affine connection|cartan|moving frame)"
)

# Strong exclude patterns to kill topic drift early
DEFAULT_EXCLUDE_REGEX = (
    r"(border(s)?|treaty|war|country|countries|politics|election|"
    r"black hole|fiction|astronomy|latinia|bosnia|herzegovina|russia|"
    r"teleportation|tachyon|quasar|planet|exoplanet|wave event|"
    r"biography|born|death|football|basketball|"
    r"category:.*(time scales|history|people|companies))"
)

# -----------------------------
# SQLite schema (same core tables as your ingest script)
# -----------------------------

SCHEMA_SQL = """
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS categories (
  cat_id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL UNIQUE,
  page_title TEXT NOT NULL,
  depth INTEGER NOT NULL,
  root_title TEXT NOT NULL,
  discovered_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS category_edges (
  parent_cat_title TEXT NOT NULL,
  child_cat_title  TEXT NOT NULL,
  PRIMARY KEY(parent_cat_title, child_cat_title)
);

CREATE INDEX IF NOT EXISTS idx_cat_edges_parent ON category_edges(parent_cat_title);
CREATE INDEX IF NOT EXISTS idx_cat_edges_child  ON category_edges(child_cat_title);

CREATE TABLE IF NOT EXISTS pages (
  page_id INTEGER NOT NULL PRIMARY KEY,
  title TEXT NOT NULL,
  canonical_guess TEXT NOT NULL,
  ns INTEGER NOT NULL,
  first_seen_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pages_title ON pages(title);

CREATE TABLE IF NOT EXISTS category_pages (
  cat_title TEXT NOT NULL,
  page_id INTEGER NOT NULL,
  PRIMARY KEY(cat_title, page_id)
);

CREATE TABLE IF NOT EXISTS crawl_state (
  cat_title TEXT PRIMARY KEY,
  expanded_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_crawl_state_expanded ON crawl_state(expanded_at);
"""

# -----------------------------
# DB helpers
# -----------------------------

def connect(db_path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON;")
    return conn

def ensure_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(SCHEMA_SQL)
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
# Crawl-state helpers
# -----------------------------

def crawl_state_is_expanded(conn: sqlite3.Connection, cat_title: str) -> bool:
    row = conn.execute("SELECT 1 FROM crawl_state WHERE cat_title = ? LIMIT 1", (cat_title,)).fetchone()
    return row is not None

def crawl_state_mark_expanded(conn: sqlite3.Connection, cat_title: str) -> None:
    conn.execute("""
        INSERT INTO crawl_state(cat_title, expanded_at)
        VALUES (?, ?)
        ON CONFLICT(cat_title) DO UPDATE SET expanded_at=excluded.expanded_at
    """, (cat_title, int(time.time())))
    conn.commit()

def crawl_state_reset(conn: sqlite3.Connection) -> None:
    conn.execute("DELETE FROM crawl_state")
    conn.commit()

# -----------------------------
# Storage ops
# -----------------------------

def mark_category(conn: sqlite3.Connection, title: str, depth: int, root_title: str) -> None:
    conn.execute("""
        INSERT INTO categories(title, page_title, depth, root_title, discovered_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(title) DO UPDATE SET
          depth=excluded.depth,
          root_title=excluded.root_title
    """, (title, f"Category:{title}", depth, root_title, int(time.time())))
    conn.commit()

def store_category_edge(conn: sqlite3.Connection, parent_cat: str, child_cat: str) -> None:
    conn.execute("""
        INSERT INTO category_edges(parent_cat_title, child_cat_title)
        VALUES (?, ?)
        ON CONFLICT(parent_cat_title, child_cat_title) DO NOTHING
    """, (parent_cat, child_cat))
    conn.commit()

def store_page(conn: sqlite3.Connection, pageid: int, title: str, ns: int) -> None:
    canonical_guess = title.replace(" ", "_")
    now = int(time.time())
    conn.execute("""
        INSERT INTO pages(page_id, title, canonical_guess, ns, first_seen_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(page_id) DO UPDATE SET
          title=excluded.title,
          canonical_guess=excluded.canonical_guess,
          ns=excluded.ns
    """, (pageid, title, canonical_guess, ns, now))
    conn.commit()

def link_category_page(conn: sqlite3.Connection, cat_title: str, page_id: int) -> None:
    conn.execute("""
        INSERT INTO category_pages(cat_title, page_id)
        VALUES (?, ?)
        ON CONFLICT(cat_title, page_id) DO NOTHING
    """, (cat_title, page_id))
    conn.commit()

# -----------------------------
# MediaWiki categorymembers
# -----------------------------

def get_category_members(cat_title: str, user_agent: str) -> Tuple[List[Dict[str, Any]], Optional[Dict[str, Any]]]:
    params = {
        "action": "query",
        "format": "json",
        "list": "categorymembers",
        "cmtitle": f"Category:{cat_title}",
        "cmtype": "page|subcat",
        "cmlimit": "500",
    }
    data = api_call(params, user_agent=user_agent)
    members = data.get("query", {}).get("categorymembers", []) or []
    cont = data.get("continue")
    return members, cont

def get_category_members_continued(cat_title: str, cont: Dict[str, Any], user_agent: str) -> Tuple[List[Dict[str, Any]], Optional[Dict[str, Any]]]:
    params = {
        "action": "query",
        "format": "json",
        "list": "categorymembers",
        "cmtitle": f"Category:{cat_title}",
        "cmtype": "page|subcat",
        "cmlimit": "500",
        "cmcontinue": cont.get("cmcontinue", ""),
        "continue": cont.get("continue", ""),
    }
    data = api_call(params, user_agent=user_agent)
    members = data.get("query", {}).get("categorymembers", []) or []
    new_cont = data.get("continue")
    return members, new_cont

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
# Crawl
# -----------------------------

@dataclass(frozen=True)
class CrawlLimits:
    max_depth: int
    max_pages: int
    max_categories: int

def crawl_from_roots(
    conn: sqlite3.Connection,
    root_categories: List[str],
    limits: CrawlLimits,
    user_agent: str,
    min_delay: float,
    max_delay: float,
    include_re: re.Pattern,
    exclude_re: re.Pattern,
    resume: bool,
) -> None:
    total_pages_seen: Set[int] = set()
    total_cats_seen: Set[str] = set()

    for root_cat in root_categories:
        queue: List[Tuple[str, int]] = [(root_cat, 0)]

        while queue:
            cat_title, depth = queue.pop(0)

            if depth > limits.max_depth:
                continue

            if cat_title in total_cats_seen:
                continue

            # Filter category title BEFORE expanding
            if not allowed_title(cat_title, include_re, exclude_re) and cat_title != root_cat:
                continue

            if len(total_cats_seen) >= limits.max_categories:
                print(f"[STOP] max_categories reached ({limits.max_categories})")
                return

            total_cats_seen.add(cat_title)
            mark_category(conn, cat_title, depth, root_cat)

            if resume and crawl_state_is_expanded(conn, cat_title):
                children = conn.execute("""
                    SELECT child_cat_title
                    FROM category_edges
                    WHERE parent_cat_title = ?
                """, (cat_title,)).fetchall()
                for r in children:
                    sub = str(r["child_cat_title"])
                    if sub and sub not in total_cats_seen:
                        queue.append((sub, depth + 1))
                print(f"[CRAWL-SKIP] root='{root_cat}' cat='{cat_title}' depth={depth} (already expanded)")
                continue

            try:
                members, cont = get_category_members(cat_title, user_agent=user_agent)
            except Exception as e:
                print(f"[FAIL] categorymembers '{cat_title}': {e}", file=sys.stderr)
                continue

            polite_sleep(min_delay, max_delay)

            def process_members(mems: List[Dict[str, Any]]) -> None:
                nonlocal queue

                for m in mems:
                    ns = int(m.get("ns", -1))
                    title = str(m.get("title", ""))

                    # Subcategory
                    if ns == 14 and title.startswith("Category:"):
                        sub = title[len("Category:"):].strip()
                        if not sub:
                            continue

                        # Filter subcategory title
                        if not allowed_title(sub, include_re, exclude_re):
                            continue

                        store_category_edge(conn, cat_title, sub)
                        if sub not in total_cats_seen:
                            queue.append((sub, depth + 1))
                        continue

                    # Main article
                    if ns == 0:
                        pageid = int(m.get("pageid", 0) or 0)
                        if pageid <= 0:
                            continue

                        # Filter page title
                        if not allowed_title(title, include_re, exclude_re):
                            continue

                        if pageid not in total_pages_seen:
                            if len(total_pages_seen) >= limits.max_pages:
                                print(f"[STOP] max_pages reached ({limits.max_pages})")
                                return
                            total_pages_seen.add(pageid)

                        store_page(conn, pageid, title, ns)
                        link_category_page(conn, cat_title, pageid)

            process_members(members)

            while cont:
                members, cont = get_category_members_continued(cat_title, cont, user_agent=user_agent)
                polite_sleep(min_delay, max_delay)
                process_members(members)

            crawl_state_mark_expanded(conn, cat_title)

            print(f"[CRAWL] root='{root_cat}' cat='{cat_title}' depth={depth} pages_total={len(total_pages_seen)} cats_total={len(total_cats_seen)}")

# -----------------------------
# CLI
# -----------------------------

def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="DG-only Wikipedia category crawler (filtered) -> SQLite.")
    p.add_argument("--db", default=DEFAULT_DB_PATH, help=f"SQLite path (default: {DEFAULT_DB_PATH})")
    p.add_argument("--roots", nargs="*", default=DEFAULT_ROOT_CATEGORIES, help="Root categories (names without 'Category:')")
    p.add_argument("--depth", type=int, default=DEFAULT_MAX_DEPTH, help=f"Max category depth (default: {DEFAULT_MAX_DEPTH})")
    p.add_argument("--max-pages", type=int, default=DEFAULT_MAX_PAGES, help=f"Safety cap for pages (default: {DEFAULT_MAX_PAGES})")
    p.add_argument("--max-cats", type=int, default=DEFAULT_MAX_CATS, help=f"Safety cap for cats (default: {DEFAULT_MAX_CATS})")
    p.add_argument("--min-delay", type=float, default=DEFAULT_MIN_DELAY, help="Min delay between requests (seconds)")
    p.add_argument("--max-delay", type=float, default=DEFAULT_MAX_DELAY, help="Max delay between requests (seconds)")
    p.add_argument("--user-agent", default="LocalMathRef/1.0 (educational; +https://example.invalid)", help="User-Agent header")

    p.add_argument("--include-regex", default=DEFAULT_INCLUDE_REGEX, help="Regex: allow titles if match (case-insensitive)")
    p.add_argument("--exclude-regex", default=DEFAULT_EXCLUDE_REGEX, help="Regex: reject titles if match (case-insensitive)")

    p.add_argument("--create-only", action="store_true", help="Create DB schema and exit")
    p.add_argument("--reset-crawl-state", action="store_true", help="Delete crawl_state so next crawl expands everything again")
    p.add_argument("--no-resume", action="store_true", help="Do NOT use crawl_state; expand categories again")
    return p.parse_args()

def main() -> None:
    args = parse_args()
    conn = connect(args.db)
    ensure_schema(conn)

    if args.create_only:
        print(f"[OK] SQLite DB created/verified: {args.db}")
        return

    if args.reset_crawl_state:
        crawl_state_reset(conn)
        print("[OK] crawl_state reset (all categories will be expanded again next crawl)")

    limits = CrawlLimits(
        max_depth=int(args.depth),
        max_pages=int(args.max_pages),
        max_categories=int(args.max_cats),
    )

    include_re = mk_re(args.include_regex)
    exclude_re = mk_re(args.exclude_regex)

    resume = not args.no_resume

    crawl_from_roots(
        conn=conn,
        root_categories=args.roots,
        limits=limits,
        user_agent=args.user_agent,
        min_delay=float(args.min_delay),
        max_delay=float(args.max_delay) if float(args.max_delay) >= float(args.min_delay) else float(args.min_delay),
        include_re=include_re,
        exclude_re=exclude_re,
        resume=resume,
    )

    print(f"[OK] Crawl done. DB ready: {args.db}")

if __name__ == "__main__":
    main()
