import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {afterEach,expect,it,vi} from "vitest";
import {createMath3DProject,createMixedWorkspaceDocument,createProjectStudyFromDocuments,
  createQuantumStudyFromTemplate,normalizeQuantumStudyDocument,parseMath3DProject,
  replaceMath3DProjectWorkspace,serializeMath3DProject,upsertMath3DProjectQuantumScene} from "@math3d/core";
import {quantumSceneDocumentFromVerifiedOpen} from "./quantumSceneAdmission";
import {pinQuantumStudySample,quantumStudyRecord,quantumStudySelectionEvidence} from "./quantumStudySelection";
import {createQuantumStudySelectionWorkbook,normalizeQuantumStudyWorkbookEvidence} from "./quantumStudyWorkbook";
import type {WorkbookQuantumStudyEvidence} from "@math3d/workbook";

const directory=fileURLToPath(new URL("../../../tests/fixtures/quantum-ute2/ute2-landau-385f86e1c78131452a2ea145.qscene",import.meta.url));
const scene=JSON.parse(readFileSync(fileURLToPath(new URL("../../../tests/fixtures/quantum-ute2/ute2-landau-385f86e1c78131452a2ea145.qscene/scene.json",import.meta.url)),"utf8"));
const fingerprint="af66c7e09710379df0380fd6b560616946467798d9bc16a8f0186a11d3d76d24";
const reference={format:"quantum-scene/v1" as const,title:scene.title,directory,sceneFingerprint:fingerprint};
const opened={ok:true as const,canceled:false as const,directory,reference:{directory,sceneFingerprint:fingerprint},
  document:{title:scene.title,extensions:{"quantum-scene/v1":{scene}}},remembered:false,
  mappedObjectIds:["stationary","stable","global"],deferredObjectIds:[],deferredFieldIds:[]};
afterEach(()=>vi.unstubAllGlobals());

it("retains one exact Landau scene as a Project Study and withholds changed source values",async()=>{
  const document=quantumSceneDocumentFromVerifiedOpen(opened as any);
  const template=createQuantumStudyFromTemplate("ute2-landau",document,[document]);
  expect(template.panels.map(panel=>panel.role)).toEqual(["stationary"]);
  expect(normalizeQuantumStudyDocument(template,[document]).ok).toBe(true);
  expect(normalizeQuantumStudyDocument({...template,source:{...template.source,resultSha256:"0".repeat(64)}},[document]).ok).toBe(false);
  const base=createMath3DProject(createMixedWorkspaceDocument({entries:[],activeDocumentIds:[],
    results:[],artifacts:[],relations:[],committedSelection:null,constructions:[]}),
    {stableKey:"ute2-landau-project"});
  const linked=upsertMath3DProjectQuantumScene(base,reference);
  const staged=replaceMath3DProjectWorkspace(linked,createMixedWorkspaceDocument({...linked.workspace,
    entries:[{module:"quantum" as const,checkpoint:document,expected:document.identity,replay:null}],
    activeDocumentIds:[document.identity.id],quantumStudies:[template]}));
  const withStudy=createProjectStudyFromDocuments(staged,["ute2-landau",scene.provenance.runId],template.title,[document.identity.id]);
  const reopened=parseMath3DProject(serializeMath3DProject(withStudy));
  const study=reopened.workspace.studies![0]!;
  expect(quantumStudyRecord(reopened,study)?.templateId).toBe("ute2-landau");
  const selected=pinQuantumStudySample(reopened,study,"stationary",3,"stationary");
  const sample={fingerprint,runId:scene.provenance.runId,resultSha256:scene.provenance.resultSha256,
    sampleIndex:3,amplitudes:[.7715,.5117],freeEnergy:-.27381,state:"mixed",locallyStable:true,
    globalMinimum:true,units:{amplitude:"dimensionless",freeEnergy:"dimensionless"},
    qualification:"producer-supplied stationary candidate"};
  const api={openReference:vi.fn(async()=>opened),ute2LandauSample:vi.fn(async()=>sample)};
  vi.stubGlobal("window",{quantumScenes:api});
  const report=await quantumStudySelectionEvidence(selected,selected.workspace.studies![0]!);
  expect(report.values.stationary).toMatchObject({globalMinimum:true,state:"mixed"});
  expect(report.omissions).toContainEqual(expect.stringMatching(/no fitted UTe2 phase boundary/i));
  const workbook=createQuantumStudySelectionWorkbook(selected,selected.workspace.studies![0]!,
    report as WorkbookQuantumStudyEvidence["snapshot"],"ute2-workbook","ute2-selection");
  const citation=workbook.stages[1]!.blocks[0]!.quantumStudyEvidence;
  expect(normalizeQuantumStudyWorkbookEvidence(citation)?.snapshot.sources).toHaveLength(1);
  api.openReference.mockRejectedValueOnce(new Error("source bytes changed"));
  const withheld=await quantumStudySelectionEvidence(selected,selected.workspace.studies![0]!);
  expect(withheld.values).toEqual({});
  expect(withheld.omissions).toContainEqual(expect.stringMatching(/source verification failed/i));
});
