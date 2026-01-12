#!/usr/bin/env python3
"""
wiki_geo_ingest.py  (FULL VERSION, GRAPH SUBJECTS, RESTARTABLE CRAWL + WIKITEXT MARKUP)

Build an offline SQLite corpus for Geometry / Differential Geometry from Wikipedia:
- Crawl Wikipedia category trees (MediaWiki Action API)
- Store discovered pages + subcategories (deduped)
- Build a GRAPH of subjects (nodes) and edges between them:
    * root subject -> category-subject (contains)
    * category-subject -> subcategory-subject (contains)
- Fetch /page/summary JSON for each page (Wikimedia REST)
- Store normalized term cards + raw JSON (deduped, idempotent)
- Track page_id -> term_id mapping to avoid “canonical changed” orphan buildup
- Map terms to ALL subject nodes for categories that contained the page
- Optional DAG cycle prevention for edges (enabled by default)
- Optional prune orphan terms after ingest
- Restartable crawl via crawl_state table (no migrations required; new DB only)
- NEW: Fetch and cache MediaWiki markup (wikitext) for each page (Action API revisions)
- Modes:
    * default: crawl + ingest
    * --create-only: create DB schema then exit
    * --crawl-only: crawl only
    * --ingest-only: ingest only (from already crawled pages)

No external dependencies.
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
# Defaults (edit as you like)
# -----------------------------

DEFAULT_ROOT_CATEGORIES = [
    "Geometry",
    "Differential geometry",
    "Surfaces",
    "Curvature",
    "Riemannian geometry",
    "Manifolds",
    "Geodesics",
    "Minimal surfaces",
    "Tensor calculus",
    "Vector bundles",
]

DEFAULT_DB_PATH = "wiki_geometry.sqlite3"

# MediaWiki Action API (category crawl + wikitext)
WIKI_API = "https://en.wikipedia.org/w/api.php"

# Wikimedia REST summary endpoint (term cards)
WIKI_SUMMARY_BASE = "https://en.wikipedia.org/api/rest_v1/page/summary/"

# Throttling (be polite)
DEFAULT_MIN_DELAY = 0.25
DEFAULT_MAX_DELAY = 0.75

# Crawler controls
DEFAULT_MAX_DEPTH = 4
DEFAULT_MAX_PAGES = 20000   # safety cap
DEFAULT_MAX_CATS = 5000     # safety cap

# Summary caching
DEFAULT_TTL_DAYS = 120

# Markup (wikitext) caching
DEFAULT_MARKUP_TTL_DAYS = 365


# -----------------------------
# SQLite schema (dedupe-safe + graph + crawl resume + markup)
# -----------------------------

SCHEMA_SQL = """
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;

-- Subject nodes (graph vertices)
CREATE TABLE IF NOT EXISTS subjects (
  subject_id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- Subject edges (graph edges)
-- A subject can have many parents and many children.
CREATE TABLE IF NOT EXISTS subject_edges (
  parent_subject_id INTEGER NOT NULL,
  child_subject_id  INTEGER NOT NULL,
  kind TEXT NOT NULL DEFAULT 'contains',   -- contains / related / prerequisite / etc.
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(parent_subject_id, child_subject_id, kind),
  FOREIGN KEY(parent_subject_id) REFERENCES subjects(subject_id),
  FOREIGN KEY(child_subject_id)  REFERENCES subjects(subject_id)
);

CREATE INDEX IF NOT EXISTS idx_edges_parent ON subject_edges(parent_subject_id);
CREATE INDEX IF NOT EXISTS idx_edges_child  ON subject_edges(child_subject_id);

-- Categories discovered from crawl
CREATE TABLE IF NOT EXISTS categories (
  cat_id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL UNIQUE,            -- e.g. "Differential geometry"
  page_title TEXT NOT NULL,              -- e.g. "Category:Differential geometry"
  depth INTEGER NOT NULL,
  root_subject_slug TEXT NOT NULL,
  discovered_at INTEGER NOT NULL
);

-- Category graph: Category A contains Category B (both are Wikipedia category titles)
CREATE TABLE IF NOT EXISTS category_edges (
  parent_cat_title TEXT NOT NULL,
  child_cat_title  TEXT NOT NULL,
  PRIMARY KEY(parent_cat_title, child_cat_title)
);

CREATE INDEX IF NOT EXISTS idx_cat_edges_parent ON category_edges(parent_cat_title);
CREATE INDEX IF NOT EXISTS idx_cat_edges_child  ON category_edges(child_cat_title);

-- Pages discovered from categories
CREATE TABLE IF NOT EXISTS pages (
  page_id INTEGER NOT NULL,              -- Wikipedia numeric pageid
  title TEXT NOT NULL,                   -- e.g. "Gauss map"
  canonical_guess TEXT NOT NULL,         -- e.g. "Gauss_map" (from title; can differ from REST canonical)
  ns INTEGER NOT NULL,                   -- namespace; we keep ns=0 only
  first_seen_at INTEGER NOT NULL,
  PRIMARY KEY(page_id)
);

-- Many-to-many: which category produced which page
CREATE TABLE IF NOT EXISTS category_pages (
  cat_title TEXT NOT NULL,
  page_id INTEGER NOT NULL,
  PRIMARY KEY(cat_title, page_id)
);

-- Restartable crawl: which categories have been expanded (members fetched)
CREATE TABLE IF NOT EXISTS crawl_state (
  cat_title TEXT PRIMARY KEY,
  expanded_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_crawl_state_expanded ON crawl_state(expanded_at);

-- Map page_id -> current canonical term_id after REST normalization
CREATE TABLE IF NOT EXISTS page_terms (
  page_id INTEGER PRIMARY KEY,
  term_id TEXT NOT NULL
);

-- Normalized term cards for UI
CREATE TABLE IF NOT EXISTS terms (
  term_id TEXT PRIMARY KEY,              -- "wiki:en:Gauss_map"
  source TEXT NOT NULL,                  -- "wikipedia"
  lang TEXT NOT NULL,                    -- "en"
  canonical TEXT NOT NULL,               -- "Gauss_map" (from REST titles.canonical if present)
  title TEXT NOT NULL,                   -- "Gauss map"
  description TEXT NOT NULL,
  extract TEXT NOT NULL,
  wikibase_item TEXT NOT NULL,
  pageid INTEGER,
  revision TEXT,
  timestamp TEXT,
  url TEXT NOT NULL,
  summary_type TEXT NOT NULL,            -- "standard" / "disambiguation" / etc.
  fetched_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

-- Raw summary JSON (optional)
CREATE TABLE IF NOT EXISTS raw_cache (
  term_id TEXT PRIMARY KEY,
  raw_json TEXT NOT NULL,
  fetched_at INTEGER NOT NULL
);

-- NEW: MediaWiki markup (wikitext) cache per page_id
CREATE TABLE IF NOT EXISTS page_markup (
  page_id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  rev_id INTEGER,
  parent_id INTEGER,
  sha1 TEXT,
  timestamp TEXT,
  wikitext TEXT NOT NULL,
  fetched_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  FOREIGN KEY(page_id) REFERENCES pages(page_id)
);

CREATE INDEX IF NOT EXISTS idx_page_markup_expires ON page_markup(expires_at);

-- Map subjects (graph nodes) to terms
CREATE TABLE IF NOT EXISTS subject_terms (
  subject_id INTEGER NOT NULL,
  term_id TEXT NOT NULL,
  is_featured INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(subject_id, term_id),
  FOREIGN KEY(subject_id) REFERENCES subjects(subject_id),
  FOREIGN KEY(term_id) REFERENCES terms(term_id)
);

CREATE INDEX IF NOT EXISTS idx_pages_title ON pages(title);
CREATE INDEX IF NOT EXISTS idx_terms_title ON terms(title);
CREATE INDEX IF NOT EXISTS idx_categories_root ON categories(root_subject_slug, depth);
CREATE INDEX IF NOT EXISTS idx_subject_terms_subject ON subject_terms(subject_id, sort_order);
"""


def connect(db_path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON;")
    return conn


def ensure_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(SCHEMA_SQL)
    conn.commit()


# -----------------------------
# Helpers
# -----------------------------

def slugify(s: str) -> str:
    s = s.strip().lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = re.sub(r"-{2,}", "-", s).strip("-")
    return s or "subject"


def strip_html_tags(s: str) -> str:
    return re.sub(r"<[^>]*>", "", s or "").strip()


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


def fetch_summary(canonical_or_title: str, user_agent: str) -> Dict[str, Any]:
    encoded = urllib.parse.quote(canonical_or_title, safe="")
    url = f"{WIKI_SUMMARY_BASE}{encoded}"
    return http_get_json(url, headers={"User-Agent": user_agent, "Accept": "application/json"})


def fetch_wikitext_by_title(page_title: str, user_agent: str) -> Dict[str, Any]:
    """
    Fetch raw MediaWiki markup (wikitext) via action=query revisions.
    Returns full JSON response; wikitext is in:
      query.pages[0].revisions[0].slots.main.content
    """
    params = {
        "action": "query",
        "format": "json",
        "formatversion": "2",
        "redirects": "1",
        "prop": "revisions",
        "titles": page_title,
        "rvslots": "main",
        "rvprop": "content|ids|timestamp|sha1",
    }
    return api_call(params, user_agent=user_agent)


# -----------------------------
# Crawl-state helpers (restartable crawl)
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
# Graph ops (subjects + edges)
# -----------------------------

def upsert_subject(conn: sqlite3.Connection, slug: str, title: str, sort_order: int = 0) -> int:
    conn.execute("""
        INSERT INTO subjects(slug, title, sort_order)
        VALUES (?, ?, ?)
        ON CONFLICT(slug) DO UPDATE SET
          title=excluded.title,
          sort_order=excluded.sort_order
    """, (slug, title, sort_order))
    conn.commit()
    row = conn.execute("SELECT subject_id FROM subjects WHERE slug = ?", (slug,)).fetchone()
    return int(row["subject_id"])


def get_subject_id(conn: sqlite3.Connection, slug: str) -> Optional[int]:
    row = conn.execute("SELECT subject_id FROM subjects WHERE slug = ? LIMIT 1", (slug,)).fetchone()
    return int(row["subject_id"]) if row else None


def subject_reachable(conn: sqlite3.Connection, start_id: int, target_id: int, kind: str = "contains") -> bool:
    row = conn.execute("""
        WITH RECURSIVE reach(x) AS (
          SELECT child_subject_id
          FROM subject_edges
          WHERE parent_subject_id = ? AND kind = ?
          UNION ALL
          SELECT e.child_subject_id
          FROM subject_edges e
          JOIN reach r ON e.parent_subject_id = r.x
          WHERE e.kind = ?
        )
        SELECT 1 FROM reach WHERE x = ? LIMIT 1
    """, (start_id, kind, kind, target_id)).fetchone()
    return row is not None


def upsert_edge(
    conn: sqlite3.Connection,
    parent_id: int,
    child_id: int,
    kind: str = "contains",
    sort_order: int = 0,
    prevent_cycles: bool = True
) -> bool:
    if parent_id == child_id:
        return False

    if prevent_cycles:
        if subject_reachable(conn, child_id, parent_id, kind=kind):
            return False

    conn.execute("""
        INSERT INTO subject_edges(parent_subject_id, child_subject_id, kind, sort_order)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(parent_subject_id, child_subject_id, kind) DO UPDATE SET
          sort_order=excluded.sort_order
    """, (parent_id, child_id, kind, sort_order))
    conn.commit()
    return True


# -----------------------------
# Wikipedia category crawl
# -----------------------------

@dataclass(frozen=True)
class CrawlLimits:
    max_depth: int
    max_pages: int
    max_categories: int


def mark_category(conn: sqlite3.Connection, title: str, depth: int, root_slug: str) -> None:
    conn.execute("""
        INSERT INTO categories(title, page_title, depth, root_subject_slug, discovered_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(title) DO NOTHING
    """, (title, f"Category:{title}", depth, root_slug, int(time.time())))
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


def crawl_from_roots(
    conn: sqlite3.Connection,
    root_categories: List[str],
    limits: CrawlLimits,
    user_agent: str,
    min_delay: float,
    max_delay: float,
    prevent_subject_cycles: bool,
    resume: bool,
    crawl_pass_id: int
) -> None:
    total_pages_seen: Set[int] = set()
    total_cats_seen: Set[str] = set()

    for idx, root_cat in enumerate(root_categories):
        root_slug = slugify(root_cat)
        root_subject_id = upsert_subject(conn, root_slug, root_cat, sort_order=idx)

        queue: List[Tuple[str, int]] = [(root_cat, 0)]

        while queue:
            cat_title, depth = queue.pop(0)

            if depth > limits.max_depth:
                continue

            if cat_title in total_cats_seen:
                continue

            if len(total_cats_seen) >= limits.max_categories:
                print(f"[STOP] max_categories reached ({limits.max_categories})")
                return

            total_cats_seen.add(cat_title)
            mark_category(conn, cat_title, depth, root_slug)

            cat_slug = slugify(cat_title)
            cat_subject_id = upsert_subject(conn, cat_slug, cat_title, sort_order=0)
            if cat_subject_id != root_subject_id:
                upsert_edge(conn, root_subject_id, cat_subject_id, kind="contains", sort_order=depth, prevent_cycles=prevent_subject_cycles)

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

                    if ns == 14 and title.startswith("Category:"):
                        sub = title[len("Category:"):]
                        if not sub:
                            continue

                        store_category_edge(conn, cat_title, sub)

                        sub_slug = slugify(sub)
                        sub_subject_id = upsert_subject(conn, sub_slug, sub, sort_order=0)
                        upsert_edge(conn, cat_subject_id, sub_subject_id, kind="contains", sort_order=0, prevent_cycles=prevent_subject_cycles)

                        if sub not in total_cats_seen:
                            queue.append((sub, depth + 1))
                        continue

                    if ns == 0:
                        pageid = int(m.get("pageid", 0))
                        if pageid <= 0:
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

            if crawl_pass_id > 0:
                pass

            print(f"[CRAWL] root='{root_cat}' cat='{cat_title}' depth={depth} pages_total={len(total_pages_seen)} cats_total={len(total_cats_seen)}")


# -----------------------------
# Ingest: pages -> summaries -> term cards (+ optional wikitext markup)
# -----------------------------

@dataclass(frozen=True)
class TermCard:
    term_id: str
    source: str
    lang: str
    canonical: str
    title: str
    description: str
    extract: str
    wikibase_item: str
    pageid: Optional[int]
    revision: Optional[str]
    timestamp: Optional[str]
    url: str
    summary_type: str
    fetched_at: int


def normalize_summary(summary: Dict[str, Any]) -> TermCard:
    titles = summary.get("titles") or {}
    title = summary.get("title") or ""
    displaytitle = summary.get("displaytitle") or ""
    canonical = titles.get("canonical") or title.replace(" ", "_")

    lang = summary.get("lang") or "en"
    term_id = f"wiki:{lang}:{canonical}"

    content_urls = summary.get("content_urls") or {}
    desktop = content_urls.get("desktop") or {}
    mobile = content_urls.get("mobile") or {}
    url = desktop.get("page") or mobile.get("page") or ""

    return TermCard(
        term_id=term_id,
        source="wikipedia",
        lang=lang,
        canonical=canonical,
        title=strip_html_tags(displaytitle) or titles.get("normalized") or title or canonical.replace("_", " "),
        description=summary.get("description") or "",
        extract=summary.get("extract") or "",
        wikibase_item=summary.get("wikibase_item") or "",
        pageid=summary.get("pageid"),
        revision=summary.get("revision"),
        timestamp=summary.get("timestamp"),
        url=url,
        summary_type=summary.get("type") or "unknown",
        fetched_at=int(time.time()),
    )


def term_cached_fresh(conn: sqlite3.Connection, term_id: str) -> bool:
    now = int(time.time())
    row = conn.execute(
        "SELECT 1 FROM terms WHERE term_id = ? AND expires_at > ? LIMIT 1",
        (term_id, now)
    ).fetchone()
    return row is not None


def upsert_term(conn: sqlite3.Connection, card: TermCard, raw: Dict[str, Any], ttl_days: int) -> None:
    now = int(time.time())
    expires_at = now + ttl_days * 24 * 3600

    conn.execute("""
        INSERT INTO terms(
          term_id, source, lang, canonical, title, description, extract, wikibase_item,
          pageid, revision, timestamp, url, summary_type, fetched_at, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(term_id) DO UPDATE SET
          title=excluded.title,
          description=excluded.description,
          extract=excluded.extract,
          wikibase_item=excluded.wikibase_item,
          pageid=excluded.pageid,
          revision=excluded.revision,
          timestamp=excluded.timestamp,
          url=excluded.url,
          summary_type=excluded.summary_type,
          fetched_at=excluded.fetched_at,
          expires_at=excluded.expires_at
    """, (
        card.term_id, card.source, card.lang, card.canonical, card.title,
        card.description, card.extract, card.wikibase_item, card.pageid,
        card.revision, card.timestamp, card.url, card.summary_type,
        card.fetched_at, expires_at
    ))

    conn.execute("""
        INSERT INTO raw_cache(term_id, raw_json, fetched_at)
        VALUES (?, ?, ?)
        ON CONFLICT(term_id) DO UPDATE SET
          raw_json=excluded.raw_json,
          fetched_at=excluded.fetched_at
    """, (card.term_id, json.dumps(raw, ensure_ascii=False), card.fetched_at))

    conn.commit()


def update_page_term_mapping(conn: sqlite3.Connection, page_id: int, term_id: str) -> None:
    conn.execute("""
        INSERT INTO page_terms(page_id, term_id)
        VALUES (?, ?)
        ON CONFLICT(page_id) DO UPDATE SET
          term_id=excluded.term_id
    """, (page_id, term_id))
    conn.commit()


def upsert_subject_term(conn: sqlite3.Connection, subject_id: int, term_id: str, sort_order: int = 0) -> None:
    conn.execute("""
        INSERT INTO subject_terms(subject_id, term_id, is_featured, sort_order)
        VALUES (?, ?, 0, ?)
        ON CONFLICT(subject_id, term_id) DO NOTHING
    """, (subject_id, term_id, sort_order))
    conn.commit()


def map_term_to_subjects_from_categories(conn: sqlite3.Connection, page_id: int, term_id: str) -> None:
    cats = conn.execute("""
        SELECT DISTINCT cp.cat_title
        FROM category_pages cp
        WHERE cp.page_id = ?
    """, (page_id,)).fetchall()

    for i, r in enumerate(cats):
        cat_title = str(r["cat_title"])
        cat_slug = slugify(cat_title)
        sid = get_subject_id(conn, cat_slug)
        if sid is None:
            sid = upsert_subject(conn, cat_slug, cat_title, sort_order=0)
        upsert_subject_term(conn, sid, term_id, sort_order=i)


def prune_orphan_terms(conn: sqlite3.Connection) -> int:
    before = int(conn.execute("SELECT COUNT(*) AS n FROM terms").fetchone()["n"])

    conn.execute("""
        DELETE FROM raw_cache
        WHERE term_id IN (
            SELECT t.term_id
            FROM terms t
            LEFT JOIN page_terms pt ON pt.term_id = t.term_id
            LEFT JOIN subject_terms st ON st.term_id = t.term_id
            WHERE pt.term_id IS NULL AND st.term_id IS NULL
        )
    """)
    conn.execute("""
        DELETE FROM terms
        WHERE term_id IN (
            SELECT t.term_id
            FROM terms t
            LEFT JOIN page_terms pt ON pt.term_id = t.term_id
            LEFT JOIN subject_terms st ON st.term_id = t.term_id
            WHERE pt.term_id IS NULL AND st.term_id IS NULL
        )
    """)
    conn.commit()

    after = int(conn.execute("SELECT COUNT(*) AS n FROM terms").fetchone()["n"])
    return before - after


def page_markup_cached_fresh(conn: sqlite3.Connection, page_id: int) -> bool:
    now = int(time.time())
    row = conn.execute(
        "SELECT 1 FROM page_markup WHERE page_id = ? AND expires_at > ? LIMIT 1",
        (page_id, now)
    ).fetchone()
    return row is not None


def upsert_page_markup(
    conn: sqlite3.Connection,
    page_id: int,
    title: str,
    wikitext: str,
    rev_id: Optional[int],
    parent_id: Optional[int],
    sha1: Optional[str],
    timestamp: Optional[str],
    ttl_days: int
) -> None:
    now = int(time.time())
    expires_at = now + ttl_days * 24 * 3600

    conn.execute("""
        INSERT INTO page_markup(
          page_id, title, rev_id, parent_id, sha1, timestamp, wikitext, fetched_at, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(page_id) DO UPDATE SET
          title=excluded.title,
          rev_id=excluded.rev_id,
          parent_id=excluded.parent_id,
          sha1=excluded.sha1,
          timestamp=excluded.timestamp,
          wikitext=excluded.wikitext,
          fetched_at=excluded.fetched_at,
          expires_at=excluded.expires_at
    """, (
        page_id, title, rev_id, parent_id, sha1, timestamp, wikitext, now, expires_at
    ))
    conn.commit()


def extract_wikitext_from_query_response(resp: Dict[str, Any]) -> Tuple[str, Optional[int], Optional[int], Optional[str], Optional[str], str]:
    """
    Returns: (wikitext, rev_id, parent_id, sha1, timestamp, resolved_title)
    """
    pages = (resp.get("query") or {}).get("pages") or []
    if not pages:
        return "", None, None, None, None, ""

    p0 = pages[0] or {}
    resolved_title = str(p0.get("title") or "")
    revisions = p0.get("revisions") or []
    if not revisions:
        return "", None, None, None, None, resolved_title

    r0 = revisions[0] or {}
    rev_id = r0.get("revid")
    parent_id = r0.get("parentid")
    sha1 = r0.get("sha1")
    timestamp = r0.get("timestamp")

    slots = r0.get("slots") or {}
    main = slots.get("main") or {}
    wikitext = main.get("content") or ""
    return str(wikitext), (int(rev_id) if rev_id is not None else None), (int(parent_id) if parent_id is not None else None), (str(sha1) if sha1 is not None else None), (str(timestamp) if timestamp is not None else None), resolved_title


def ingest_summaries(
    conn: sqlite3.Connection,
    user_agent: str,
    min_delay: float,
    max_delay: float,
    ttl_days: int,
    limit: Optional[int] = None,
    skip_disambiguation: bool = True,
    only_expired: bool = True,
    fetch_markup: bool = True,
    markup_ttl_days: int = DEFAULT_MARKUP_TTL_DAYS,
) -> None:
    rows = conn.execute("""
        SELECT page_id, title, canonical_guess
        FROM pages
        WHERE ns = 0
        ORDER BY page_id
    """).fetchall()

    if limit is not None:
        rows = rows[:limit]

    total = len(rows)
    ok = 0
    skipped = 0
    failed = 0
    disambig_skipped = 0
    markup_ok = 0
    markup_skipped = 0
    markup_failed = 0

    for idx, r in enumerate(rows, start=1):
        page_id = int(r["page_id"])
        page_title = str(r["title"])
        canonical_guess = str(r["canonical_guess"])

        # --------- Summary ingest (terms/raw_cache) ----------
        mapped = conn.execute("SELECT term_id FROM page_terms WHERE page_id = ?", (page_id,)).fetchone()
        if mapped:
            mapped_term_id = str(mapped["term_id"])
            if only_expired and term_cached_fresh(conn, mapped_term_id):
                skipped += 1
            else:
                # even if not fresh, we'll try to refetch summary below
                pass

        try:
            do_fetch_summary = True
            if mapped and only_expired:
                mapped_term_id = str(mapped["term_id"])
                if term_cached_fresh(conn, mapped_term_id):
                    do_fetch_summary = False

            if do_fetch_summary:
                raw = fetch_summary(canonical_guess, user_agent=user_agent)
                card = normalize_summary(raw)

                if skip_disambiguation and card.summary_type == "disambiguation":
                    disambig_skipped += 1
                    skipped += 1
                else:
                    if only_expired and term_cached_fresh(conn, card.term_id):
                        update_page_term_mapping(conn, page_id, card.term_id)
                        map_term_to_subjects_from_categories(conn, page_id, card.term_id)
                        skipped += 1
                    else:
                        upsert_term(conn, card, raw, ttl_days=ttl_days)
                        update_page_term_mapping(conn, page_id, card.term_id)
                        map_term_to_subjects_from_categories(conn, page_id, card.term_id)
                        ok += 1
            else:
                # already fresh; still ensure mappings to subjects exist
                mapped_term_id = str(mapped["term_id"])
                map_term_to_subjects_from_categories(conn, page_id, mapped_term_id)

        except Exception as e:
            failed += 1
            print(f"[FAIL] summary '{canonical_guess}': {e}", file=sys.stderr)

        polite_sleep(min_delay, max_delay)

        # --------- Markup ingest (page_markup) ----------
        if fetch_markup:
            try:
                if only_expired and page_markup_cached_fresh(conn, page_id):
                    markup_skipped += 1
                else:
                    resp = fetch_wikitext_by_title(page_title, user_agent=user_agent)
                    wikitext, rev_id, parent_id, sha1, ts, resolved_title = extract_wikitext_from_query_response(resp)

                    if not wikitext:
                        # avoid storing empties unless you want to; count as failed for visibility
                        markup_failed += 1
                        print(f"[FAIL] markup '{page_title}': empty wikitext (missing revisions?)", file=sys.stderr)
                    else:
                        upsert_page_markup(
                            conn=conn,
                            page_id=page_id,
                            title=(resolved_title or page_title),
                            wikitext=wikitext,
                            rev_id=rev_id,
                            parent_id=parent_id,
                            sha1=sha1,
                            timestamp=ts,
                            ttl_days=markup_ttl_days
                        )
                        markup_ok += 1

            except Exception as e:
                markup_failed += 1
                print(f"[FAIL] markup '{page_title}': {e}", file=sys.stderr)

            polite_sleep(min_delay, max_delay)

        if idx % 50 == 0 or idx == total:
            print(
                f"[INGEST] {idx}/{total} "
                f"terms_ok={ok} terms_skipped={skipped} disambig={disambig_skipped} terms_failed={failed} "
                f"markup_ok={markup_ok} markup_skipped={markup_skipped} markup_failed={markup_failed}"
            )

    print(
        f"[DONE] total={total} "
        f"terms_ok={ok} terms_skipped={skipped} disambig={disambig_skipped} terms_failed={failed} "
        f"markup_ok={markup_ok} markup_skipped={markup_skipped} markup_failed={markup_failed}"
    )


# -----------------------------
# CLI
# -----------------------------

def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Crawl Wikipedia geometry categories into SQLite and cache summaries + wikitext markup (graph subjects).")
    p.add_argument("--db", default=DEFAULT_DB_PATH, help=f"SQLite path (default: {DEFAULT_DB_PATH})")
    p.add_argument("--roots", nargs="*", default=DEFAULT_ROOT_CATEGORIES, help="Root categories (names without 'Category:')")
    p.add_argument("--depth", type=int, default=DEFAULT_MAX_DEPTH, help=f"Max category depth (default: {DEFAULT_MAX_DEPTH})")
    p.add_argument("--max-pages", type=int, default=DEFAULT_MAX_PAGES, help=f"Safety cap for discovered pages (default: {DEFAULT_MAX_PAGES})")
    p.add_argument("--max-cats", type=int, default=DEFAULT_MAX_CATS, help=f"Safety cap for discovered categories (default: {DEFAULT_MAX_CATS})")
    p.add_argument("--min-delay", type=float, default=DEFAULT_MIN_DELAY, help="Min delay between requests (seconds)")
    p.add_argument("--max-delay", type=float, default=DEFAULT_MAX_DELAY, help="Max delay between requests (seconds)")
    p.add_argument("--ttl-days", type=int, default=DEFAULT_TTL_DAYS, help=f"TTL for cached term cards (default: {DEFAULT_TTL_DAYS})")
    p.add_argument("--markup-ttl-days", type=int, default=DEFAULT_MARKUP_TTL_DAYS, help=f"TTL for cached wikitext markup (default: {DEFAULT_MARKUP_TTL_DAYS})")
    p.add_argument("--user-agent", default="LocalMathRef/1.0 (educational; +https://example.invalid)", help="User-Agent header")

    # modes
    p.add_argument("--create-only", action="store_true", help="Create DB schema and exit (no crawl, no ingest)")
    p.add_argument("--crawl-only", action="store_true", help="Only crawl categories/pages; do not fetch summaries/markup")
    p.add_argument("--ingest-only", action="store_true", help="Only fetch summaries/markup for existing pages; do not crawl")

    # crawl resume behavior
    p.add_argument("--no-resume", action="store_true", help="Do NOT use crawl_state; expand categories again (default: resume)")
    p.add_argument("--reset-crawl-state", action="store_true", help="Delete crawl_state so next crawl expands everything again")

    # ingest controls
    p.add_argument("--ingest-limit", type=int, default=0, help="Limit number of pages to ingest (0 = no limit)")
    p.add_argument("--no-skip-disambiguation", action="store_true",
                   help="Do NOT skip disambiguation pages (default: skip them)")
    p.add_argument("--no-only-expired", action="store_true",
                   help="Do NOT restrict ingest to expired items (default: only expired/fresh-skip)")
    p.add_argument("--no-fetch-markup", action="store_true",
                   help="Do NOT fetch/store wikitext markup (default: fetch it)")
    p.add_argument("--prune-orphans", action="store_true",
                   help="After ingest, delete terms that are not referenced by page_terms or subject_terms")
    p.add_argument("--allow-cycles", action="store_true",
                   help="Allow cycles in subject graph edges (default: prevent cycles)")

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
        max_depth=args.depth,
        max_pages=args.max_pages,
        max_categories=args.max_cats,
    )

    skip_disambiguation = not args.no_skip_disambiguation
    only_expired = not args.no_only_expired
    ingest_limit = None if args.ingest_limit == 0 else args.ingest_limit
    prevent_subject_cycles = not args.allow_cycles
    resume = not args.no_resume
    fetch_markup = not args.no_fetch_markup

    if not args.ingest_only:
        print("[STEP] Crawling categories -> pages (and building subject graph)")
        crawl_from_roots(
            conn=conn,
            root_categories=args.roots,
            limits=limits,
            user_agent=args.user_agent,
            min_delay=args.min_delay,
            max_delay=args.max_delay,
            prevent_subject_cycles=prevent_subject_cycles,
            resume=resume,
            crawl_pass_id=int(time.time()),
        )

    if not args.crawl_only:
        print("[STEP] Fetching summaries -> terms (+ optional wikitext markup)")
        ingest_summaries(
            conn=conn,
            user_agent=args.user_agent,
            min_delay=args.min_delay,
            max_delay=args.max_delay,
            ttl_days=args.ttl_days,
            limit=ingest_limit,
            skip_disambiguation=skip_disambiguation,
            only_expired=only_expired,
            fetch_markup=fetch_markup,
            markup_ttl_days=args.markup_ttl_days,
        )

    if args.prune_orphans and not args.crawl_only:
        removed = prune_orphan_terms(conn)
        print(f"[CLEANUP] pruned orphan terms: {removed}")

    print(f"[OK] SQLite DB ready: {args.db}")


if __name__ == "__main__":
    main()
