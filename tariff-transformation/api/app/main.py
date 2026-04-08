import os
from datetime import datetime, timezone

from fastapi import FastAPI

app = FastAPI(title="Tariff Transformation API", version="0.1.0")


@app.get("/health")
def health() -> dict:
    return {
        "ok": True,
        "service": "api",
        "time_utc": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/config")
def config() -> dict:
    return {
        "database_url": os.getenv("DATABASE_URL", ""),
        "minio_url": os.getenv("MINIO_URL", ""),
        "minio_access_key": os.getenv("MINIO_ACCESS_KEY", ""),
    }
