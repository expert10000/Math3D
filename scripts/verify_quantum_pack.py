"""Host-independent, read-only .qpack integrity and scene reconstruction check."""
import argparse
import hashlib
import json
from pathlib import Path
import re
from tempfile import TemporaryDirectory


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def inspect(directory: Path):
    if not directory.is_dir() or directory.is_symlink() or directory.suffix != ".qpack":
        raise ValueError("Expected a real .qpack directory")
    if {child.name for child in directory.iterdir()} != {"blobs", "manifest.json", "project.json"}:
        raise ValueError("Unexpected pack entries")
    if any(child.is_symlink() for child in directory.iterdir()) or not (directory / "blobs").is_dir():
        raise ValueError("Linked or missing pack entries")
    manifest = json.loads((directory / "manifest.json").read_text(encoding="utf-8"))
    if manifest.get("schema") != "math3d.quantum-project-pack/v1":
        raise ValueError("Unsupported pack schema")
    project_file = directory / "project.json"
    if manifest["project"]["sha256"] != sha(project_file):
        raise ValueError("Project hash changed")
    project = json.loads(project_file.read_text(encoding="utf-8"))
    if project.get("format") == "math3d.project-package":
        project = project["project"]
    records = manifest["scenes"]
    fingerprints = {record["fingerprint"] for record in records}
    if len(fingerprints) != len(records) or len(records) > 16:
        raise ValueError("Invalid scene inventory")
    for reference in project.get("quantumScenes", []):
        fingerprint = reference["sceneFingerprint"]
        if fingerprint not in fingerprints or reference["directory"] != f"scenes/{fingerprint}.qscene":
            raise ValueError("Project contains a host path or mismatched scene reference")
    if len(project.get("quantumScenes", [])) != len(records):
        raise ValueError("Project and pack scene inventory differ")
    for entry in project.get("workspace", {}).get("entries", []):
        if entry.get("module") == "quantum":
            checkpoint = entry.get("checkpoint", {})
            fingerprint = checkpoint.get("source", {}).get("sceneFingerprint")
            if fingerprint not in fingerprints or checkpoint.get("location", {}).get("directory") != f"scenes/{fingerprint}.qscene":
                raise ValueError("Quantum document contains a host path or mismatched scene")
    with TemporaryDirectory(prefix="qi36-portable-") as temporary:
        target = Path(temporary)
        for record in records:
            scene = target / (record["fingerprint"] + ".qscene")
            scene.mkdir()
            for file in record["files"]:
                name, digest = file["name"], file["sha256"]
                if not (name in ("scene.json", "bundle.json") or re.fullmatch(r"[A-Za-z0-9_-]{1,100}\.f64", name)):
                    raise ValueError("Unsafe scene file name")
                blob = directory / "blobs" / digest
                if blob.is_symlink() or not blob.is_file() or sha(blob) != digest or blob.stat().st_size != file["bytes"]:
                    raise ValueError("Changed or missing blob")
                (scene / name).write_bytes(blob.read_bytes())
            for name in ("scene.json", "bundle.json"):
                json.loads((scene / name).read_text(encoding="utf-8"))
    return {"schema": "math3d.qpack-portability-evidence/v1", "host": __import__("platform").system(),
            "sceneCount": len(records), "projectSha256": sha(project_file), "workerRequired": False,
            "relativeReferences": True, "reconstructed": True}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pack", type=Path)
    args = parser.parse_args()
    print(json.dumps(inspect(args.pack.resolve()), indent=2, sort_keys=True))
