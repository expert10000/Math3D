param(
  [int]$ActionsPerArea = 12,
  [int]$ActionDelayMs = 5000,
  [int]$SceneLoadTimeoutMs = 30000,
  [string]$Areas = "topology,complex"
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
Push-Location $repoRoot
try {
  $oldActionsPerArea = $env:MATH3D_RELEASE_CHECK_ACTIONS_PER_AREA
  $oldActionDelayMs = $env:MATH3D_RELEASE_CHECK_ACTION_DELAY_MS
  $oldSceneLoadTimeoutMs = $env:MATH3D_RELEASE_CHECK_SCENE_LOAD_TIMEOUT_MS
  $oldAreas = $env:MATH3D_RELEASE_CHECK_AREAS

  $env:MATH3D_RELEASE_CHECK_ACTIONS_PER_AREA = [string]$ActionsPerArea
  $env:MATH3D_RELEASE_CHECK_ACTION_DELAY_MS = [string]$ActionDelayMs
  $env:MATH3D_RELEASE_CHECK_SCENE_LOAD_TIMEOUT_MS = [string]$SceneLoadTimeoutMs
  $env:MATH3D_RELEASE_CHECK_AREAS = $Areas

  npx playwright test tests/e2e/release-1-4-9-topology-complex.spec.ts --reporter=list
}
finally {
  if ($null -eq $oldActionsPerArea) {
    Remove-Item Env:\MATH3D_RELEASE_CHECK_ACTIONS_PER_AREA -ErrorAction SilentlyContinue
  } else {
    $env:MATH3D_RELEASE_CHECK_ACTIONS_PER_AREA = $oldActionsPerArea
  }

  if ($null -eq $oldActionDelayMs) {
    Remove-Item Env:\MATH3D_RELEASE_CHECK_ACTION_DELAY_MS -ErrorAction SilentlyContinue
  } else {
    $env:MATH3D_RELEASE_CHECK_ACTION_DELAY_MS = $oldActionDelayMs
  }

  if ($null -eq $oldSceneLoadTimeoutMs) {
    Remove-Item Env:\MATH3D_RELEASE_CHECK_SCENE_LOAD_TIMEOUT_MS -ErrorAction SilentlyContinue
  } else {
    $env:MATH3D_RELEASE_CHECK_SCENE_LOAD_TIMEOUT_MS = $oldSceneLoadTimeoutMs
  }

  if ($null -eq $oldAreas) {
    Remove-Item Env:\MATH3D_RELEASE_CHECK_AREAS -ErrorAction SilentlyContinue
  } else {
    $env:MATH3D_RELEASE_CHECK_AREAS = $oldAreas
  }

  Pop-Location
}
