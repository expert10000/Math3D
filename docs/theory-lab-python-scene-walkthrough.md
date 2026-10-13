# Walkthrough: Theory Lab and Python scenes in Math3D

This desktop walkthrough checks two independent producers against the same installed Math3D application: a saved Theory Lab orbital exported as a verified `.qscene` folder, and the pinned external Python example published as a verified `.sscene` folder. It then keeps both as source-backed Project links, restarts Math3D, and checks a reversible missing-source failure. Allow about 15–25 minutes if both applications and Python are already installed.

## Before you start

- Open the **installed Math3D** from its ordinary Desktop shortcut. Have Theory Lab available for the first half and an independently installed **Python 3.10+** for the second half. Math3D does not bundle Python for this workflow.
- Choose a persistent test parent folder, such as `Documents/Math3D-scene-check`. Do not use a temporary directory: the Project links to the original scene folders instead of copying their datasets.
- Keep the complete `.qscene` and `.sscene` directories, including manifests and binary files. Choose fresh output names; neither publisher overwrites an existing scene.
- For this installed-app test, use **export in Theory Lab → manual import in Math3D**. Theory Lab's direct **Open in Math3D** currently launches a built source checkout, which would test a different executable.

The source hashes check that the scene bytes have not changed since publication. They do not certify the producer's scientific correctness or identity. Both views are read-only in Math3D; it does not call the Theory Lab worker.

## A. Export and inspect a Theory Lab orbital

1. In Theory Lab, open **Orbitals** (or **Atomic orbitals**), select the **2p** preset, and click **Compute orbital**. An existing saved 2p orbital run also works.
2. Open **Scenes** (or **Portable scenes**) and select that saved run. If you just computed it and it is absent, refresh the saved-run list. Verify that the scene names the intended run and orbital before exporting.
3. Click **Export scene bundle**. Pick your test parent folder. Theory Lab creates a new `<run-id>.qscene` directory with `bundle.json`, `scene.json`, and referenced binary datasets. Note the exact directory name; do not select an individual file later.
4. In installed Math3D choose **File → Open verified quantum scene**, and select the whole `.qscene` directory. The preview should open only after Math3D verifies its manifest, schema, and dataset hashes.
5. Try **Field slice**, **Volume**, and **Density surface** if offered by this scene. Move the slice or select a visible sample. Check the right-hand source panel for the saved run, coordinates, units, datasets and supplied model inputs. A density display is derived from the supplied orbital amplitudes; Math3D has not calculated a new orbital.
6. Close the preview. In **Projects → Contents → Quantum scenes**, choose **Attach open verified scene**, then **Save project**. The Project should list the source as a read-only link. It may also offer **Add read-only Project document**; that optional document is not needed for this walkthrough.

![Representative verified hydrogenic 2p field slice in Math3D](assets/screenshots/quantum-scenes-design-2026-10-12/07-hydrogen-2p-slice.png)

*Representative pinned 2p example from an earlier Math3D capture, not the particular Theory Lab run you export. Your parameters and camera may differ. [See the corresponding density surface](assets/screenshots/quantum-scenes-design-2026-10-12/07b-hydrogen-2p-surface.png).*

If you do not have a working Theory Lab run yet, **File → Verified quantum examples → Hydrogenic · 2p** is a useful viewer-only rehearsal. It does **not** replace steps 1–3 or test the Lab export boundary.

## B. Publish and inspect the Python reference scene

1. In Math3D choose **File → Verified quantum examples**. Under **Scientific interchange proof**, click **Publish with reference Python script…**.
2. In the native pickers choose your installed `python.exe` and the offered `sincos-grid.json` example. The **Choose a new .sscene output directory** Save dialog may open in the spec's `integrations/python/examples` folder. Navigate to your persistent test parent folder **before** saving. Type a fresh name such as `python-sincos.sscene` in **File name** and click **Save**; do not first create a folder with that name. The publisher exclusively creates it and refuses an existing destination.
3. Back in the scrollable **Verified quantum examples** dialog, look below the Publish buttons for **Explicit local-code execution**. Check the executable, pinned script, spec, **New output** path and displayed SHA-256 hashes. Saving the path alone has not launched Python or created the `.sscene`. Click **Run trusted Python publisher**, then approve **Run external Python code?**. The reference script is pinned, but it still runs with your account permissions; this is not a sandbox. If the review box is absent, check the top of the dialog for a **Python publication refused** message.
4. The `sin(x)cos(y)` scalar-height preview should appear after verification. Click the surface or **Inspect center sample**. Check the exact grid index, coordinates, value and units. Close the preview.
5. To exercise independent reopening, use **File → Verified quantum examples → Open external .sscene folder…**, select the whole published `.sscene` directory, and inspect it again. This import does not start Python.
6. Close the preview, then choose **Projects → Contents → Scientific scenes → Attach open verified scene** and **Save project**. The link retains the source directory and manifest fingerprint, not the field array in Project JSON.

After a successful run, the chosen `.sscene` is a **directory**, not a single file. It contains `bundle.json`, `manifest.json` and a `real.f64` dataset. If it is not in your intended test parent folder, check the **New output** path from the review dialog: saving from the spec's examples folder places the generated scene there. Keep generated scenes out of a source checkout when possible, and attach only the final persistent location to your Project.

Use **Publish with custom Python script…** only for code you independently trust. It is outside this bounded reference-publisher test.

## C. Restart, reopen, and test failure safely

1. Close Math3D completely and start it again from the same installed Desktop shortcut. Open the saved Project if it is not restored automatically.
2. In **Projects → Contents**, click **Verify and view scene** for each of the two links. Both should independently verify and reopen their original source folders. The quantum and scientific entries remain distinct.
3. For a **reversible missing-source test**, first copy one *entire* scene directory to a second persistent location. Do not change any file inside either copy. Rename the original directory temporarily in Explorer, then click that Project link's **Verify and view scene**. Math3D should report the source unavailable and show no unverified preview; the rest of the Project should still open.
4. Choose **Relink source** for the unavailable entry and select the unchanged copy. Relinking should accept only an exact verified match. Click **Save project**, then **Verify and view scene** again. You can instead restore the original folder name and reopen it if you do not want to change the saved link.

Do not damage your only source folder to test tamper refusal. The automated installed-app acceptance separately covers changed dataset bytes and rejects them.

## Record the result

For each source, note whether import, sample inspection, Project attachment, restart reopening and missing-source refusal were clear. Also note how many clicks it took to find the scene again, whether the right-hand inspector answered your questions, and whether the initial camera showed the important structure. These observations—not another physics calculation—determine whether the deferred [SSR-07 workspace and inspector proposal](scientific-scene-runtime-roadmap.md) is needed.

If a step fails, keep the scene directory and report the exact button, message, scene type and Math3D version. For protocol and format details see the [Theory Lab scene handoff](https://github.com/expert10000/theory-lab/blob/main/docs/SCENE_HANDOFF.md), [quantum Project links](quantum-scene-project-links.md), and [Python publication workflow](scientific-scene-python-job-workflow.md).
