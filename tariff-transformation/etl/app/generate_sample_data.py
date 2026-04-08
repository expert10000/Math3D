from __future__ import annotations

import csv
import json
import os
from datetime import datetime, timezone
from pathlib import Path


GENERATED_DIR = Path(os.getenv("DATA_GENERATED_DIR", "/data/generated"))
INCOMING_DIR = Path(os.getenv("DATA_INCOMING_DIR", "/data/incoming"))


def _ts() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def main() -> None:
    GENERATED_DIR.mkdir(parents=True, exist_ok=True)
    INCOMING_DIR.mkdir(parents=True, exist_ok=True)

    rows = [
        {"commodity_code": "1001.99", "origin_country": "PL", "duty_rate": 7.5},
        {"commodity_code": "8501.10", "origin_country": "DE", "duty_rate": 4.2},
        {"commodity_code": "9403.60", "origin_country": "CN", "duty_rate": 9.8},
    ]

    csv_path = GENERATED_DIR / f"sample_{_ts()}.csv"
    json_path = GENERATED_DIR / f"sample_{_ts()}.json"

    with csv_path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["commodity_code", "origin_country", "duty_rate"])
        writer.writeheader()
        writer.writerows(rows)

    with json_path.open("w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=True, indent=2)

    incoming_csv = INCOMING_DIR / csv_path.name
    incoming_json = INCOMING_DIR / json_path.name
    incoming_csv.write_bytes(csv_path.read_bytes())
    incoming_json.write_bytes(json_path.read_bytes())

    print(f"[etl] generated: {csv_path}")
    print(f"[etl] generated: {json_path}")
    print(f"[etl] copied to incoming: {incoming_csv}")
    print(f"[etl] copied to incoming: {incoming_json}")


if __name__ == "__main__":
    main()
