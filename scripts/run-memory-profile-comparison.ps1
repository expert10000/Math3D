param(
  [int]$Actions = 8,
  [int]$ActionDelayMs = 3000,
  [int]$SampleIntervalMs = 500,
  [int]$FinalIdleMs = 5000,
  [string[]]$Scenarios = @("navigation", "canvas", "module-sweep", "mixed")
)

$ErrorActionPreference = "Stop"

$previousScenario = $env:MATH3D_MEMORY_PROFILE_SCENARIO
$previousActions = $env:MATH3D_MEMORY_PROFILE_ACTIONS
$previousActionDelay = $env:MATH3D_MEMORY_PROFILE_ACTION_DELAY_MS
$previousSampleInterval = $env:MATH3D_MEMORY_PROFILE_SAMPLE_INTERVAL_MS
$previousFinalIdle = $env:MATH3D_MEMORY_PROFILE_FINAL_IDLE_MS

try {
  foreach ($scenario in $Scenarios) {
    Write-Host "[memory-profile] scenario=$scenario actions=$Actions delayMs=$ActionDelayMs"
    $env:MATH3D_MEMORY_PROFILE_SCENARIO = $scenario
    $env:MATH3D_MEMORY_PROFILE_ACTIONS = "$Actions"
    $env:MATH3D_MEMORY_PROFILE_ACTION_DELAY_MS = "$ActionDelayMs"
    $env:MATH3D_MEMORY_PROFILE_SAMPLE_INTERVAL_MS = "$SampleIntervalMs"
    $env:MATH3D_MEMORY_PROFILE_FINAL_IDLE_MS = "$FinalIdleMs"
    npx playwright test tests/e2e/memory-profile.spec.ts --reporter=list
  }

  node scripts/summarize-memory-profiles.mjs
} finally {
  $env:MATH3D_MEMORY_PROFILE_SCENARIO = $previousScenario
  $env:MATH3D_MEMORY_PROFILE_ACTIONS = $previousActions
  $env:MATH3D_MEMORY_PROFILE_ACTION_DELAY_MS = $previousActionDelay
  $env:MATH3D_MEMORY_PROFILE_SAMPLE_INTERVAL_MS = $previousSampleInterval
  $env:MATH3D_MEMORY_PROFILE_FINAL_IDLE_MS = $previousFinalIdle
}
