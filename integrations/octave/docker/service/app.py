import math

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .octave_adapter import run_octave_eig, run_octave_solve

app = FastAPI(title="Math3D Octave Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class EigRequest(BaseModel):
    matrix: list[list[float]]


class SolveRequest(BaseModel):
    matrix: list[list[float]]
    rhs: list[float]


def validate_square_numeric_matrix(matrix: list[list[float]]) -> None:
    if not matrix:
        raise HTTPException(status_code=400, detail="Matrix is empty")

    n = len(matrix)
    for row in matrix:
        if len(row) != n:
            raise HTTPException(status_code=400, detail="Matrix must be square")
        for value in row:
            if not math.isfinite(float(value)):
                raise HTTPException(status_code=400, detail="Matrix must contain only finite numbers")


def validate_rhs(rhs: list[float], n: int) -> None:
    if len(rhs) != n:
        raise HTTPException(status_code=400, detail="rhs length must match matrix dimension")
    for value in rhs:
        if not math.isfinite(float(value)):
            raise HTTPException(status_code=400, detail="rhs must contain only finite numbers")


@app.get("/health")
def health():
    return {
        "status": "ok",
        "engine": "gnu-octave",
        "available": True,
    }


@app.post("/eig")
def eig(req: EigRequest):
    validate_square_numeric_matrix(req.matrix)
    return run_octave_eig(req.matrix)


@app.post("/solve")
def solve(req: SolveRequest):
    validate_square_numeric_matrix(req.matrix)
    validate_rhs(req.rhs, len(req.matrix))
    return run_octave_solve(req.matrix, req.rhs)
