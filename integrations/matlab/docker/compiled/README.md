# Compiled MATLAB Package Placement

Place compiled MATLAB Runtime package artifacts for `eig_demo` in:

`integrations/matlab/docker/compiled/eig_demo_package/`

Expected container path:

`/opt/math3d/matlab/eig_demo_package`

Notes:

- Do not commit large/binary runtime files.
- Keep only placeholders (for example `.gitkeep`) in git.
- Rebuild the container after replacing package files.

