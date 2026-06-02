from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .sage_adapter import run_sage_operation
from .sage_runner import OPERATIONS


app = FastAPI(title="Math3D SageMath Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class SageRunRequest(BaseModel):
    operation: str = Field(min_length=1)
    params: dict[str, Any] = Field(default_factory=dict)


@app.get("/")
def root():
    return {
        "service": "Math3D SageMath Worker",
        "engine": "sagemath",
        "status": "ok",
        "endpoints": {
            "health": "/health",
            "operations": "/operations",
            "run": "/run",
            "docs": "/docs",
        },
    }


@app.get("/health")
def health():
    return {
        "status": "ok",
        "engine": "sagemath",
        "available": True,
        "operations": sorted(OPERATIONS.keys()),
    }


@app.get("/operations")
def operations():
    return {
        "engine": "sagemath",
        "operations": sorted(OPERATIONS.keys()),
    }


@app.post("/run")
def run(req: SageRunRequest):
    if req.operation not in OPERATIONS:
        raise HTTPException(status_code=400, detail=f"Unsupported Sage operation: {req.operation}")
    result = run_sage_operation(req.operation, req.params)
    return result
