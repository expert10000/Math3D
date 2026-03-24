# Gitingest Digest

This folder contains prompt-friendly text digests generated with `gitingest` for architecture analysis with LLMs.

## Main Output

- `analysis/gitingest/math3d-architecture-digest.txt`

## Why Split By Folder

Running `gitingest` from repo root hits a workspace symlink recursion on this project (`renderer/node_modules/math3d/...`).
To keep output stable and usable, digests are generated per source area and then merged.

## Generation Commands

```bash
python -m gitingest apps -o analysis/gitingest/apps-digest.txt
python -m gitingest packages -o analysis/gitingest/packages-digest.txt
python -m gitingest renderer/src -o analysis/gitingest/renderer-src-digest.txt
python -m gitingest src -o analysis/gitingest/electron-main-digest.txt
python -m gitingest scripts -o analysis/gitingest/scripts-digest.txt
python -m gitingest tests -o analysis/gitingest/tests-digest.txt
```

Then combine those files into:

- `analysis/gitingest/math3d-architecture-digest.txt`
