param(
  [int]$ActionDelayMs = 5000,
  [string]$Families = "explicit,implicit,parametric,spline,constructed",
  [int]$CardLimit = 0
)

$ErrorActionPreference = "Stop"

$previousScenario = $env:MATH3D_MEMORY_PROFILE_SCENARIO
$previousFamilies = $env:MATH3D_MEMORY_PROFILE_SURFACE_FAMILIES
$previousActionDelay = $env:MATH3D_MEMORY_PROFILE_ACTION_DELAY_MS
$previousCardLimit = $env:MATH3D_MEMORY_PROFILE_SURFACE_CARD_LIMIT

try {
  Write-Host "[memory-profile] surface-gallery-chain families=$Families delayMs=$ActionDelayMs cardLimit=$CardLimit"
  $env:MATH3D_MEMORY_PROFILE_SCENARIO = "surface-gallery-chain"
  $env:MATH3D_MEMORY_PROFILE_SURFACE_FAMILIES = $Families
  $env:MATH3D_MEMORY_PROFILE_ACTION_DELAY_MS = "$ActionDelayMs"
  $env:MATH3D_MEMORY_PROFILE_SURFACE_CARD_LIMIT = "$CardLimit"
  npx playwright test tests/e2e/memory-profile.spec.ts --reporter=list
  node scripts/summarize-memory-profiles.mjs
} finally {
  $env:MATH3D_MEMORY_PROFILE_SCENARIO = $previousScenario
  $env:MATH3D_MEMORY_PROFILE_SURFACE_FAMILIES = $previousFamilies
  $env:MATH3D_MEMORY_PROFILE_ACTION_DELAY_MS = $previousActionDelay
  $env:MATH3D_MEMORY_PROFILE_SURFACE_CARD_LIMIT = $previousCardLimit
}
