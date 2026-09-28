import { expect,it } from "vitest";
import { emptyGraphGalleryPreferences,parseGraphGalleryPreferences,recordGraphGalleryRecent,toggleGraphGalleryFavorite } from "./graph2dGalleryPreferences";
it("keeps local favorites separate and retains unavailable catalog IDs",()=>{
  const empty=emptyGraphGalleryPreferences(),favorite=toggleGraphGalleryFavorite(empty,"missing-example");
  expect(favorite.favorites).toEqual(["missing-example"]);expect(empty.favorites).toEqual([]);
  expect(parseGraphGalleryPreferences(JSON.stringify(favorite))).toEqual(favorite);
  expect(toggleGraphGalleryFavorite(favorite,"missing-example")).toEqual(empty);
});
it("bounds recents at 32 unique IDs in most-recent order",()=>{
  let state=emptyGraphGalleryPreferences();for(let i=0;i<40;i++)state=recordGraphGalleryRecent(state,`example-${i}`);
  expect(state.recent).toHaveLength(32);expect(state.recent[0]).toBe("example-39");
  state=recordGraphGalleryRecent(state,"example-10");expect(state.recent[0]).toBe("example-10");expect(new Set(state.recent).size).toBe(32);
});
it("rejects future, corrupt, duplicate and excess settings without guessing",()=>{
  const empty=emptyGraphGalleryPreferences();expect(parseGraphGalleryPreferences(null)).toEqual(empty);
  for(const patch of [{version:2},{extra:true},{favorites:["x","x"]},{recent:Array(33).fill("x")},{favorites:["../bad"]}])
    expect(()=>parseGraphGalleryPreferences(JSON.stringify({...empty,...patch}))).toThrow();
});
