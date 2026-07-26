param(
  [string]$Jupyter = $env:JUPYTERLITE_JUPYTER,
  [string]$Python = $env:JUPYTERLITE_PYTHON
)

$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $true

$projectRoot = Split-Path -Parent $PSScriptRoot
$buildProjectRoot = $projectRoot
$stagingRoot = $null
$pyodideVersion = "0.27.7"
$pyodideArchive = "https://github.com/pyodide/pyodide/releases/download/$pyodideVersion/pyodide-core-$pyodideVersion.tar.bz2"
$pyodideCdn = "https://fastly.jsdelivr.net/pyodide/v$pyodideVersion/full"
$pyodidePackages = @(
  "micropip",
  "ipython",
  "jedi",
  "numpy",
  "pandas",
  "matplotlib",
  "scipy",
  "scikit-learn",
  "pillow",
  "xgboost",
  "opencv-python",
  "ssl"
)
$purePythonRequirements = @(
  "comm==0.2.3+ai.trainer.1",
  "et-xmlfile==2.0.0",
  "openpyxl==3.1.5",
  "seaborn==0.13.2",
  "imbalanced-learn==0.14.0"
)

function Get-NormalizedPackageName([string]$Name) {
  return $Name.ToLowerInvariant().Replace("_", "-").Replace(".", "-")
}

if (-not $Python) {
  $localPython = Join-Path $projectRoot ".jupyterlite-venv\Scripts\python.exe"
  if (Test-Path $localPython) {
    try {
      & $localPython --version 2>$null | Out-Null
      if ($LASTEXITCODE -eq 0) { $Python = $localPython }
    } catch { $Python = $null }
  }
}
if (-not $Python) {
  $Python = (Get-Command python -ErrorAction Stop).Source
}

$useJupyterModule = $false
if (-not $Jupyter) {
  $venvSitePackages = Join-Path $projectRoot ".jupyterlite-venv\Lib\site-packages"
  if (-not (Test-Path $venvSitePackages)) {
    throw "JupyterLite Python packages are missing. Recreate .jupyterlite-venv or provide JUPYTERLITE_JUPYTER."
  }
  $env:PYTHONPATH = if ($env:PYTHONPATH) { "$venvSitePackages;$env:PYTHONPATH" } else { $venvSitePackages }
  & $Python -m jupyterlite_core.app --version | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "JupyterLite cannot run with JUPYTERLITE_PYTHON=$Python"
  }
  $useJupyterModule = $true
}

function Invoke-JupyterLiteBuild([bool]$IncludeAiTrainerExtension) {
  Push-Location (Join-Path $buildProjectRoot "jupyterlite")
  try {
    $buildArgs = @(
      "build",
      "--output-dir", "..\public\lite",
      "--contents", "content",
      "--apps", "lab",
      "--no-sourcemaps",
      "--pyodide", $pyodideArchive
    )
    if ($IncludeAiTrainerExtension) {
      $buildArgs += "--LiteBuildConfig.federated_extensions=..\jupyterlite-extension\labextension"
    }
    if ($useJupyterModule) {
      & $Python -m jupyterlite_core.app @buildArgs
    } else {
      & $Jupyter lite @buildArgs
    }
    if ($LASTEXITCODE -ne 0) {
      throw "JupyterLite build failed with exit code $LASTEXITCODE"
    }
  } finally {
    Pop-Location
  }
}

function Copy-JupyterLiteOutputToProject {
  if ($buildProjectRoot -eq $projectRoot) {
    return
  }
  $source = [System.IO.Path]::GetFullPath((Join-Path $buildProjectRoot "public\lite"))
  $target = [System.IO.Path]::GetFullPath((Join-Path $projectRoot "public\lite"))
  $expectedTarget = [System.IO.Path]::GetFullPath((Join-Path $projectRoot "public\lite"))
  if ($target -ne $expectedTarget -or -not (Test-Path -LiteralPath $source -PathType Container)) {
    throw "Refusing to copy an unexpected JupyterLite output: $source -> $target"
  }
  New-Item -ItemType Directory -Force -Path $target | Out-Null
  Copy-Item -Path (Join-Path $source "*") -Destination $target -Recurse -Force
}

Push-Location $projectRoot
try {
  npm.cmd run labs:runtime
  & $Python (Join-Path $projectRoot "scripts\generate-jupyterlite-notebooks.py")
  if ($LASTEXITCODE -ne 0) {
    throw "Notebook generation failed with exit code $LASTEXITCODE"
  }

  $pipliteWheelsDir = Join-Path $projectRoot "jupyterlite\pypi"
  New-Item -ItemType Directory -Force -Path $pipliteWheelsDir | Out-Null
  $vendoredComm = Join-Path $projectRoot "scripts\vendor\comm"
  $vendoredCommWheel = Get-ChildItem $pipliteWheelsDir -Filter "comm-0.2.3+ai.trainer.1-*.whl"
  if (-not $vendoredCommWheel) {
    & $Python -m pip wheel --disable-pip-version-check --no-deps --no-build-isolation `
      --wheel-dir $pipliteWheelsDir $vendoredComm
    if ($LASTEXITCODE -ne 0) {
      throw "Failed to build the vendored offline comm wheel."
    }
  }
  foreach ($requirement in $purePythonRequirements) {
    $packageName = (Get-NormalizedPackageName ($requirement.Split("==")[0])).Replace("-", "[-_.]")
    if (-not (Get-ChildItem $pipliteWheelsDir -Filter "*.whl" | Where-Object { $_.BaseName -match "^$packageName[-_.]" })) {
      & $Python -m pip download --disable-pip-version-check --no-deps --only-binary=:all: --dest $pipliteWheelsDir $requirement
      if ($LASTEXITCODE -ne 0) {
        throw "Failed to download the pure Python wheel: $requirement"
      }
    }
  }

  # JupyterLite resolves junctions and subst drives back to their physical
  # paths. On affected Windows/Python combinations that still corrupts a
  # Chinese project path before pathlib writes the merged config. Build from
  # an actual ASCII staging directory, then copy the verified output back.
  if ($projectRoot -match "[^\x00-\x7F]") {
    $tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd("\")
    $stagingRoot = Join-Path $tempRoot "ai-trainer-jupyterlite-build-$([System.Guid]::NewGuid().ToString('N'))"
    $resolvedStagingRoot = [System.IO.Path]::GetFullPath($stagingRoot)
    if (-not $resolvedStagingRoot.StartsWith("$tempRoot\", [System.StringComparison]::OrdinalIgnoreCase)) {
      throw "Refusing to create JupyterLite staging outside the temporary directory: $resolvedStagingRoot"
    }
    New-Item -ItemType Directory -Path (Join-Path $stagingRoot "jupyterlite") -Force | Out-Null
    foreach ($fileName in @("jupyter-lite.json", "overrides.json")) {
      Copy-Item -LiteralPath (Join-Path $projectRoot "jupyterlite\$fileName") `
        -Destination (Join-Path $stagingRoot "jupyterlite\$fileName") -Force
    }
    foreach ($directoryName in @("content", "pypi", ".cache")) {
      $sourceDirectory = Join-Path $projectRoot "jupyterlite\$directoryName"
      if (Test-Path -LiteralPath $sourceDirectory) {
        Copy-Item -LiteralPath $sourceDirectory `
          -Destination (Join-Path $stagingRoot "jupyterlite\$directoryName") -Recurse -Force
      }
    }
    New-Item -ItemType Directory -Path (Join-Path $stagingRoot "scripts") -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $projectRoot "scripts\patch-jupyterlite-config.py") `
      -Destination (Join-Path $stagingRoot "scripts\patch-jupyterlite-config.py") -Force
    $buildProjectRoot = $stagingRoot
  }

  Invoke-JupyterLiteBuild $false
  Copy-JupyterLiteOutputToProject
  npm.cmd run jupyterlite:extension
  if ($LASTEXITCODE -ne 0) {
    throw "JupyterLite extension build failed with exit code $LASTEXITCODE"
  }
  if ($buildProjectRoot -ne $projectRoot) {
    New-Item -ItemType Directory -Path (Join-Path $buildProjectRoot "jupyterlite-extension") -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $projectRoot "jupyterlite-extension\labextension") `
      -Destination (Join-Path $buildProjectRoot "jupyterlite-extension\labextension") -Recurse -Force
  }
  Invoke-JupyterLiteBuild $true

  $pyodideDir = Join-Path $buildProjectRoot "public\lite\static\pyodide"
  $resolvedPyodideDir = [System.IO.Path]::GetFullPath($pyodideDir)
  $expectedPyodideDir = [System.IO.Path]::GetFullPath(
    (Join-Path $buildProjectRoot "public\lite\static\pyodide")
  )
  if ($resolvedPyodideDir -ne $expectedPyodideDir -or -not (Test-Path -LiteralPath $resolvedPyodideDir -PathType Container)) {
    throw "Refusing to clean an unexpected Pyodide directory: $resolvedPyodideDir"
  }

  & $Python (Join-Path $buildProjectRoot "scripts\patch-jupyterlite-config.py")
  if ($LASTEXITCODE -ne 0) {
    throw "JupyterLite workspace patch failed with exit code $LASTEXITCODE"
  }

  $lockPath = Join-Path $pyodideDir "pyodide-lock.json"
  $lock = Get-Content -Raw $lockPath | ConvertFrom-Json
  $packages = @{}
  foreach ($property in $lock.packages.PSObject.Properties) {
    $packages[(Get-NormalizedPackageName $property.Name)] = $property.Value
  }

  $queue = [System.Collections.Generic.Queue[string]]::new()
  foreach ($packageName in $pyodidePackages) {
    $queue.Enqueue((Get-NormalizedPackageName $packageName))
  }
  $required = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)

  while ($queue.Count -gt 0) {
    $packageName = $queue.Dequeue()
    if (-not $required.Add($packageName)) {
      continue
    }
    if (-not $packages.ContainsKey($packageName)) {
      throw "Required Pyodide package is absent from pyodide-lock.json: $packageName"
    }
    foreach ($dependency in $packages[$packageName].depends) {
      $queue.Enqueue((Get-NormalizedPackageName ([string]$dependency)))
    }
  }

  $requiredFileNames = [System.Collections.Generic.HashSet[string]]::new(
    [System.StringComparer]::OrdinalIgnoreCase
  )
  foreach ($packageName in $required) {
    [void]$requiredFileNames.Add([string]$packages[$packageName].file_name)
  }
  Get-ChildItem -LiteralPath $resolvedPyodideDir -File -Filter "*.whl" |
    Where-Object { -not $requiredFileNames.Contains($_.Name) } |
    ForEach-Object { Remove-Item -LiteralPath $_.FullName -Force }

  foreach ($packageName in ($required | Sort-Object)) {
    $package = $packages[$packageName]
    $fileName = [string]$package.file_name
    $target = Join-Path $pyodideDir $fileName
    $expectedSha256 = ([string]$package.sha256).ToLowerInvariant()
    $needsDownload = -not (Test-Path $target)

    if (-not $needsDownload) {
      $actualSha256 = (Get-FileHash $target -Algorithm SHA256).Hash.ToLowerInvariant()
      $needsDownload = $actualSha256 -ne $expectedSha256
    }

    if ($needsDownload) {
      Write-Host "Downloading Pyodide kernel dependency: $packageName"
      curl.exe -L --fail --retry 10 --retry-all-errors --retry-delay 1 `
        --connect-timeout 15 --speed-time 20 --speed-limit 1024 `
        --continue-at - -o $target "$pyodideCdn/$fileName"
    }

    $actualSha256 = (Get-FileHash $target -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actualSha256 -ne $expectedSha256) {
      throw "Pyodide package SHA-256 mismatch for $packageName ($fileName): $actualSha256"
    }
  }

  Copy-JupyterLiteOutputToProject
  Write-Host "JupyterLite build complete with self-hosted Pyodide and ONNX Runtime, $($required.Count) verified Pyodide packages, and $($purePythonRequirements.Count) local pure Python wheels."
} finally {
  Pop-Location
  if ($stagingRoot -and (Test-Path -LiteralPath $stagingRoot)) {
    $tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd("\")
    $resolvedStagingRoot = [System.IO.Path]::GetFullPath($stagingRoot)
    if (-not $resolvedStagingRoot.StartsWith("$tempRoot\ai-trainer-jupyterlite-build-", [System.StringComparison]::OrdinalIgnoreCase)) {
      throw "Refusing to remove an unexpected JupyterLite staging directory: $resolvedStagingRoot"
    }
    Remove-Item -LiteralPath $resolvedStagingRoot -Recurse -Force
  }
}
