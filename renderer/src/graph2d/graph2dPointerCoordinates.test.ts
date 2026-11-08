import { describe, expect, it } from "vitest";
import { graph2DLocalPointer } from "./graph2dPointerCoordinates";
const size = { width: 800, height: 400 };
const rect = { left: 10, top: 20, width: 400, height: 200 };
describe("Graph pointer coordinates", () => {
  it("maps CSS plot coordinates at the actual rendered scale", () => {
    expect(graph2DLocalPointer({clientX:210,clientY:120},size,rect)).toEqual({x:400,y:200});
  });
  it("refuses a hidden or collapsed plot without producing an invalid picking request", () => {
    for(const dimensions of [{width:0,height:200},{width:400,height:0},{width:-1,height:200}])
      expect(graph2DLocalPointer({clientX:20,clientY:30},size,{...rect,...dimensions})).toBeNull();
  });
  it("refuses nonfinite pointer and layout values", () => {
    expect(graph2DLocalPointer({clientX:NaN,clientY:30},size,rect)).toBeNull();
    expect(graph2DLocalPointer({clientX:20,clientY:Infinity},size,rect)).toBeNull();
    expect(graph2DLocalPointer({clientX:20,clientY:30},size,{...rect,left:Infinity})).toBeNull();
    expect(graph2DLocalPointer({clientX:20,clientY:30},{width:0,height:400},rect)).toBeNull();
  });
  it("retains finite outside coordinates needed by captured pointer drags", () => {
    expect(graph2DLocalPointer({clientX:-10,clientY:240},size,rect)).toEqual({x:-40,y:440});
  });
});
