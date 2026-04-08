from __future__ import annotations

import os
import time
from datetime import datetime, timezone
from pathlib import Path

from validate import validate_file


POLL_SECONDS = int(os.getenv("ETL_POLL_SECONDS", "10"))

INCOMING_DIR = Path(os.getenv("DATA_INCOMING_DIR", "/data/incoming"))
PROCESSED_DIR = Path(os.getenv("DATA_PROCESSED_DIR", "/data/processed"))
REJECTED_DIR = Path(os.getenv("DATA_REJECTED_DIR", "/data/rejected"))


def _now_tag() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def _prepare_dirs() -> None:
    INCOMING_DIR.mkdir(parents=True, exist_ok=True)
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    REJECTED_DIR.mkdir(parents=True, exist_ok=True)


def _move_with_tag(src: Path, dst_dir: Path) -> Path:
    tagged = dst_dir / f"{src.stem}_{_now_tag()}{src.suffix}"
    src.rename(tagged)
    return tagged


def run_once() -> None:
    _prepare_dirs()
    candidates = sorted(
        [p for p in INCOMING_DIR.iterdir() if p.is_file()],
        key=lambda p: p.name.lower(),
    )
    if not candidates:
        print("[etl] no files in incoming")
        return

    for file_path in candidates:
        ok, reason = validate_file(file_path)
        if ok:
            moved = _move_with_tag(file_path, PROCESSED_DIR)
            print(f"[etl] processed: {file_path.name} -> {moved.name}; {reason}")
        else:
            moved = _move_with_tag(file_path, REJECTED_DIR)
            print(f"[etl] rejected: {file_path.name} -> {moved.name}; {reason}")


def main() -> None:
    print("[etl] ingest loop started")
    while True:
        try:
            run_once()
        except Exception as exc:
            print(f"[etl] error: {exc}")
        time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    main()
