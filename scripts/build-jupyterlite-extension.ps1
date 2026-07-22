$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $true

$projectRoot = Split-Path -Parent $PSScriptRoot
$buildRoot = $projectRoot

if ($projectRoot -match '[^\x00-\x7F]') {
  $junction = Join-Path $env:TEMP "ai-trainer-site-build"
  if (Test-Path -LiteralPath $junction) {
    $item = Get-Item -LiteralPath $junction -Force
    if ($item.LinkType -ne "Junction" -or [string]$item.Target -ne $projectRoot) {
      throw "JupyterLite build junction exists with an unexpected target: $junction"
    }
  } else {
    New-Item -ItemType Junction -Path $junction -Target $projectRoot | Out-Null
  }
  $buildRoot = $junction
}

& npm.cmd --prefix (Join-Path $buildRoot "jupyterlite-extension") run build
if ($LASTEXITCODE -ne 0) {
  throw "JupyterLite extension build failed with exit code $LASTEXITCODE"
}
