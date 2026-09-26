# Desktop–mobile project handoff

Desktop Construction Lab now has **Export mobile handoff**. On mobile, choose **Projects → New Project → Desktop project** and select the `.math3d.handoff.json` file. Mobile previews the producer, project revision, source name, and any declared or detected content it cannot render before creating/opening a project. A Construction Lab geometry handoff keeps its original scene/extension data even though that content is not rendered by the mobile surface viewer.

When the same project ID exists locally, mobile offers **Replace matching revision** only if the incoming base revision equals the current scene revision. Otherwise it offers **Import as copy**; it never silently overwrites diverged work. Cancel or storage failure leaves the project list unchanged. A fresh import retains project and surface IDs.

Mobile **Export** and **Share** write a resumable handoff containing the current project revision and, where known, the revision imported from desktop as its base. Desktop Construction Lab **Import** accepts that handoff. For a matching project, it compares the base revision with its current scene and asks whether to replace or import a copy. On divergence it only permits a copy or cancellation. Older `math3d.scene-project` v1 files still import without a claimed base revision.

This is a file-based handoff, not live sync. Results are described in the manifest but not transferred as result bytes. Unsupported desktop-only content is preserved in the scene JSON; mobile editing does not add a renderer for it.
