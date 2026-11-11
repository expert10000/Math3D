# M3D20-12 source-host acceptance receipt

The desktop and local-browser tests below ran on Windows against application source commit `42383786c736ad6d448ce4863ff0e7fc33d345ee` with the acceptance tests in this change. This is a source-build receipt, not an installed or hosted release claim.

| Host and build | Command | Result | Journey checked |
| --- | --- | --- | --- |
| Electron source build; `renderer/dist/index.html` SHA-256 `33fb68624b41a9e04d7c7372884632a2452706cd1d617cb49b81cd44f6a36d3a` | `npm run build:core`; `npx playwright test tests/e2e/project-platform-capabilities.spec.ts --reporter=list` | Build passed; 1/1 test passed | Missing Graph source blocks full open; Cancel preserves library; verified Workbook/Note package imports and saved results survive process restart. |
| Local Playwright Chromium revision 1208; `apps/web/dist/index.html` SHA-256 `0ca3f5f5e9686b5ae4ed647eb4125041b89c1a45bde814cf2e2bb8ac003d9e61` | `npm run build:web`; `npx playwright test --config playwright.projects.config.ts tests/graph2d-web/unifiedProjects.spec.ts --grep M3D20-12 --reporter=list` | Build passed; 6/6 tests passed across `en-US/UTC` and `pl-PL/Pacific-Auckland` | Verified package reopen; blocked storage disables import and starter creation; missing source stays preview-only; an already loaded saved research Project remains inspectable with Chromium offline. |

`npx tsc -p tests/e2e/tsconfig.json --noEmit` passed. Browser offline coverage begins after the app has loaded; it does not claim a cold offline launch or hosted service-worker behavior. The tests use local Project files and do not establish live Sage or other remote computation availability. Installed Windows, hosted browser, physical Android, and installed Linux receipts remain separate gates.
