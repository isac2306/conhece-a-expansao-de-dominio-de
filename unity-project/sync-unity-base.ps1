Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $projectRoot
$sourceAssets = Join-Path $repoRoot "unity-base\\Assets"
$targetAssets = Join-Path $projectRoot "Assets"
$sourceDocs = Join-Path $repoRoot "unity-base\\docs"
$targetDocs = Join-Path $projectRoot "Docs"
$sourceAndroidPlugin = Join-Path $repoRoot "unity-base\\android-plugin"
$targetAndroidPlugin = Join-Path $projectRoot "AndroidPluginTemplate"

if (-not (Test-Path $sourceAssets)) {
  throw "Nao encontrei $sourceAssets"
}

New-Item -ItemType Directory -Force -Path $targetAssets | Out-Null
New-Item -ItemType Directory -Force -Path $targetDocs | Out-Null

Copy-Item -Path (Join-Path $sourceAssets "*") -Destination $targetAssets -Recurse -Force
if (Test-Path $sourceDocs) {
  Copy-Item -Path (Join-Path $sourceDocs "*") -Destination $targetDocs -Recurse -Force
}
if (Test-Path $sourceAndroidPlugin) {
  New-Item -ItemType Directory -Force -Path $targetAndroidPlugin | Out-Null
  Copy-Item -Path (Join-Path $sourceAndroidPlugin "*") -Destination $targetAndroidPlugin -Recurse -Force
}

Write-Host "Unity base sincronizada para $projectRoot"
