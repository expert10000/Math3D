param(
  [int]$Actions = 20,
  [int]$ActionDelayMs = 5000,
  [string[]]$Modules = @("Surfaces", "Mesh", "Volume", "Curves")
)

$ErrorActionPreference = "Stop"

$previousScenario = $env:MATH3D_MEMORY_PROFILE_SCENARIO
$previousModule = $env:MATH3D_MEMORY_PROFILE_MODULE
$previousActions = $env:MATH3D_MEMORY_PROFILE_ACTIONS
$previousActionDelay = $env:MATH3D_MEMORY_PROFILE_ACTION_DELAY_MS

try {
  foreach ($module in $Modules) {
    Write-Host "[memory-profile] module-repeat module=$module actions=$Actions delayMs=$ActionDelayMs"
    $env:MATH3D_MEMORY_PROFILE_SCENARIO = "module-repeat"
    $env:MATH3D_MEMORY_PROFILE_MODULE = $module
    $env:MATH3D_MEMORY_PROFILE_ACTIONS = "$Actions"
    $env:MATH3D_MEMORY_PROFILE_ACTION_DELAY_MS = "$ActionDelayMs"
    npx playwright test tests/e2e/memory-profile.spec.ts --reporter=list
  }

  node scripts/summarize-memory-profiles.mjs
} finally {
  $env:MATH3D_MEMORY_PROFILE_SCENARIO = $previousScenario
  $env:MATH3D_MEMORY_PROFILE_MODULE = $previousModule
  $env:MATH3D_MEMORY_PROFILE_ACTIONS = $previousActions
  $env:MATH3D_MEMORY_PROFILE_ACTION_DELAY_MS = $previousActionDelay
}
