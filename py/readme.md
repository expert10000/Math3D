# 1) Create/verify DB schema only
python wiki_geo_ingest.py --db wiki_geometry.sqlite3 --create-only

# 2) Crawl categories/pages (fills: categories, category_edges, pages, category_pages, crawl_state, subjects, subject_edges)
python wiki_geo_ingest.py --db wiki_geometry.sqlite3 --crawl-only --depth 3

# 3) Crawl again later with deeper depth (continues; skips already-expanded cats by default)
python wiki_geo_ingest.py --db wiki_geometry.sqlite3 --crawl-only --depth 5

# 4) Ingest summaries + markup (fills: terms, raw_cache, page_terms, subject_terms, page_markup)
python wiki_geo_ingest.py --db wiki_geometry.sqlite3 --ingest-only

# 5) Optional cleanup after ingest (remove orphan terms not referenced anywhere)
python wiki_geo_ingest.py --db wiki_geometry.sqlite3 --ingest-only --prune-orphans







# 0) Ensure markup tables exist
python wiki_geo_ingest.py --db wiki_geometry.sqlite3 --create-only
python wiki_geo_markup.py --db wiki_geometry.sqlite3 --create-only
python wiki_geo_markup.py --db wiki_geometry.sqlite3 --create-only
python wiki_geo_ingest.py --db wiki_geometry.sqlite3 --crawl-only --depth 3 --roots "Differential geometry"


# 1) Fetch ONLY missing/expired markup (default)
python wiki_geo_markup.py --db wiki_geometry.sqlite3

# 2) Fast test: only 200 pages
python wiki_geo_markup.py --db wiki_geometry.sqlite3 --limit 200

# 3) Force refresh everything
python wiki_geo_markup.py --db wiki_geometry.sqlite3 --no-only-expired

# 4) Fetch markup but do NOT extract links
python wiki_geo_markup.py --db wiki_geometry.sqlite3 --no-extract-links


python wiki_geo_markup.py --db wiki_geometry.sqlite3 --create-only
python wiki_geo_markup.py --db wiki_geometry.sqlite3










###

# 0) Ensure markup tables exist
python wiki_geo_ingest.py --db wiki_geometry.sqlite3 --create-only
python wiki_geo_markup.py --db wiki_geometry.sqlite3 --create-only
python wiki_geo_markup.py --db wiki_geometry.sqlite3 --create-only
python wiki_geo_ingest.py --db wiki_geometry.sqlite3 --crawl-only --depth 3 --roots "Differential geometry"



# 1) Create/verify HTML cache table
python wiki_geo_html_dg.py --db wiki_geometry.sqlite3 --create-only

# 2) Fetch HTML for DG-only pages (missing/expired only)
python wiki_geo_html_dg.py --db wiki_geometry.sqlite3

# 3) Force refresh everything (ignore TTL)
python wiki_geo_html_dg.py --db wiki_geometry.sqlite3 --no-only-expired

# 4) Limit for testing
python wiki_geo_html_dg.py --db wiki_geometry.sqlite3 --limit 25

