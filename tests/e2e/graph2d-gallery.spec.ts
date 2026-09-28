import { expect, test } from "@playwright/test";
import { launchSurfaceApp,closeSurfaceApp,resetSurfaceAppState } from "./helpers/surfaceAppHarness";
import { resolve } from "node:path";

test("GGL04 desktop browse/preview creates independent editable scenes and resumes preserved work",async()=>{
  const app=await launchSurfaceApp();
  try {
    const page=app.page;await resetSurfaceAppState(page);await page.setViewportSize({width:1440,height:900});
    await page.getByTestId("workspace-nav-graphs").click();
    await page.getByRole("button",{name:"Explore Graph Gallery",exact:true}).click();
    const gallery=page.getByTestId("graph-gallery");await expect(gallery).toBeVisible();
    await expect(gallery.getByRole("status")).toContainText("6 scenes");
    await page.screenshot({path:resolve("output/ggl04-gallery-desktop.png")});
    await gallery.getByRole("button",{name:"Preview Lissajous loops",exact:true}).click();
    await expect(gallery.getByRole("heading",{name:"Lissajous loops",exact:true})).toBeVisible();
    await gallery.getByRole("button",{name:"Close Graph Gallery"}).click();
    await expect(page.getByRole("button",{name:"Explore Graph Gallery",exact:true})).toBeFocused();
    await expect(page.getByLabel("Empty graph scene")).toContainText("0 functions");
    await page.getByTestId("graph-gallery-open").click();
    await gallery.getByRole("button",{name:"All scenes",exact:true}).click();
    await expect(gallery.getByRole("status")).toContainText("20 scenes");
    await gallery.getByLabel("Search graphs").fill("slope");
    await gallery.getByRole("button",{name:"Open Two slopes",exact:true}).click();
    await expect(gallery).not.toBeVisible();
    const functions=page.getByLabel("Graph functions");await expect(functions.getByRole("button",{name:"Edit Unit slope",exact:true})).toBeVisible();
    await functions.getByRole("button",{name:"Edit Unit slope",exact:true}).click();
    await functions.getByLabel("Function expression").fill("3*x");await functions.getByRole("button",{name:"Save function",exact:true}).click();
    await page.getByTestId("graph-gallery-open").click();await gallery.getByRole("button",{name:"Open Lissajous loops",exact:true}).click();
    await expect(functions.getByRole("button",{name:"Edit Lissajous",exact:true})).toBeVisible();
    await page.getByTestId("graph-gallery-open").click();await gallery.getByText(/Preserved projects/).click();
    await gallery.getByRole("button",{name:"Resume Two slopes",exact:true}).click();
    await functions.getByRole("button",{name:"Edit Unit slope",exact:true}).click();
    await expect(functions.getByLabel("Function expression")).toHaveValue("3*x");
    await page.getByTestId("kernel-workspace-toggle").click();await page.getByTestId("kernel-workspace-save").click();
    await expect(page.getByTestId("kernel-workspace-message")).toContainText("Saved");
    const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem("math3d.mixed-workspace.v1")!));
    expect(saved.entries.find((e:{module:string})=>e.module==="graph2d").checkpoint.source.objects[0].expression.source).toBe("3*x");
  } finally {await closeSurfaceApp(app);}
});

test("GGL05 favorites and recents persist without duplicating saved graphs",async()=>{
  const app=await launchSurfaceApp();
  try {
    const page=app.page;await resetSurfaceAppState(page);await page.setViewportSize({width:1440,height:900});
    await page.getByTestId("workspace-nav-graphs").click();await page.getByTestId("graph-gallery-open").click();
    const gallery=page.getByTestId("graph-gallery"),favorite=gallery.getByRole("button",{name:"Favorite A three-petal rose",exact:true});
    await favorite.click();await expect(favorite).toHaveAttribute("aria-pressed","true");
    await gallery.getByRole("button",{name:"Favorites",exact:true}).click();await expect(gallery.getByRole("status")).toContainText("1 scene");
    await gallery.getByRole("button",{name:"Open A three-petal rose",exact:true}).click();
    await page.getByTestId("graph-gallery-open").click();await gallery.getByRole("button",{name:"Recent",exact:true}).click();
    await expect(gallery.getByTestId("graph-gallery-card-polar-rose")).toBeVisible();
    await gallery.getByRole("button",{name:"Close Graph Gallery"}).click();await page.reload();
    await page.getByTestId("workspace-nav-graphs").click();await page.getByTestId("graph-gallery-open").click();
    await gallery.getByRole("button",{name:"Favorites",exact:true}).click();await expect(gallery.getByRole("status")).toContainText("1 scene");
    await gallery.getByRole("button",{name:"Favorite A three-petal rose",exact:true}).click();
    await expect(gallery.getByRole("status")).toContainText("0 scenes");await expect(gallery.getByText(/Bookmark a scene/)).toBeVisible();
    await gallery.getByRole("button",{name:"Recent",exact:true}).click();await expect(gallery.getByRole("status")).toContainText("1 scene");
    const settings=await page.evaluate(()=>JSON.parse(localStorage.getItem("math3d.graph2d.gallery-preferences.v1")!));
    expect(settings.favorites).toEqual([]);expect(settings.recent).toEqual(["polar-rose"]);
  } finally {await closeSurfaceApp(app);}
});
