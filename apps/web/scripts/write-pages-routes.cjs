"use strict";

const fs = require("node:fs");
const path = require("node:path");

const target = path.join(__dirname, "..", "dist", "_routes.json");
fs.writeFileSync(target, JSON.stringify({
  version: 1,
  include: ["/api/worker", "/api/worker/*", "/api/sage-private", "/api/sage-private/*"],
  exclude: [],
}, null, 2) + "\n");
console.log(`[web] wrote Pages Function routes to ${target}`);
