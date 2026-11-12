# First run: a Project and a scientific study

This guide follows the Windows desktop source build's **Minimal Surface Study** starter. The 2.0 installed candidate has not yet passed its [first-use gate](INSTALL_UPGRADE_GATE.md), so use the exact release installer only after that gate is recorded as passed. The steps describe the current Project interface; a Project-owned multi-pane Study can also save participating document references and layout.

## Open the starter

1. Launch Math3D and choose **Projects** in the workspace navigation.
2. In **Starter projects**, find **Minimal Surface Study** and choose **Open**. The first Open creates and saves your own copy. Opening that starter again resumes your copy; **New copy** starts an independent one.
3. In the Project overview, check the **Documents** list. This starter contains a Graph, a Curve, and a Surface. Use a document card or the Project document tree to open each view.
4. Open the Project detail sections **Relations** and **Results**. The starter contains three recorded document relationships and one saved derivative result. Open a result to inspect its recorded source and revision before interpreting it.
5. Open **Notes** from the Project details. The two starter Notes provide context for the linked documents and result.

Close Math3D, launch it again, open **Projects**, and choose **Open** on your saved **Minimal Surface Study** card. The same Project identity, three documents, relationships, result, and Notes should be available. A source-build automated journey checks this exact restart path. If the card is missing, stop before creating another copy and check that you launched the same installed app and user profile.

## What the terms mean

| Term | Meaning in this guide |
| --- | --- |
| **Project** | The saved owner of related documents, exact revisions, recorded relationships, results, Notes, and optional Workbooks. A saved copy has its own identity and can be reopened from the Project library. |
| **Document** | An editable or viewable scientific object such as the starter's Graph, Curve, or Surface. Its revision and source identity matter when results are checked. |
| **Result** | A saved analysis output tied to a specific source generation. Read the source and freshness status with the value; a similar title or shape does not establish provenance. |
| **Study** | A scientific question explored through several linked Project documents and evidence. **Minimal Surface Study** is a starter Project title. A saved Project-owned Study records a linked view arrangement and exact source references; it does not own duplicate source documents or results. |

## Keep and share your work

After changing a document or adding evidence, return to **Projects** and use **Save project** or **Save changes**. A view may show a new value before the Project copy is saved. Reopen the saved card to confirm the intended state. For exchange with another machine, use the Project's export route and include required source resources; a preview with a missing required source is not a full editable open. Keep an independent copy of important exported Projects.

The built-in starter does not need Sage, a separate Python installation, or an external scene folder for this walkthrough. Other operations may require the bundled worker or a configured external runtime. Availability depends on the operation and host: see the [platform capability matrix](PLATFORM_CAPABILITIES.md). In particular, a browser or mobile Project preview does not imply that every desktop editor or computation is available there.

For release qualification, the exact signed installer must pass the [fresh install and upgrade gates](INSTALL_UPGRADE_GATE.md). Source-build success alone does not establish that installed resources, signing, or migration work in a distributable 2.0 build.
