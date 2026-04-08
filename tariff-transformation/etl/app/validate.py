from __future__ import annotations

import csv
import json
from pathlib import Path


REQUIRED_FIELDS = {"commodity_code", "origin_country", "duty_rate"}


def _is_valid_record(record: dict) -> bool:
    if not isinstance(record, dict):
        return False
    if not REQUIRED_FIELDS.issubset(record.keys()):
        return False
    if not str(record.get("commodity_code", "")).strip():
        return False
    if not str(record.get("origin_country", "")).strip():
        return False
    try:
        float(record.get("duty_rate"))
    except (TypeError, ValueError):
        return False
    return True


def _validate_csv(path: Path) -> tuple[bool, str]:
    with path.open("r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        rows = list(reader)
    if not rows:
        return False, "CSV has no rows."
    for row in rows:
        if not _is_valid_record(row):
            return False, "CSV contains invalid record."
    return True, f"CSV valid ({len(rows)} rows)."


def _validate_json(path: Path) -> tuple[bool, str]:
    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)
    records = data if isinstance(data, list) else [data]
    if not records:
        return False, "JSON has no records."
    for record in records:
        if not _is_valid_record(record):
            return False, "JSON contains invalid record."
    return True, f"JSON valid ({len(records)} records)."


def validate_file(path: Path) -> tuple[bool, str]:
    suffix = path.suffix.lower()
    if suffix == ".csv":
        return _validate_csv(path)
    if suffix == ".json":
        return _validate_json(path)
    return False, f"Unsupported extension: {suffix or 'none'}"
