param(
  [string]$Jupyter = $env:JUPYTERLITE_JUPYTER,
  [string]$Python = $env:JUPYTERLITE_PYTHON
)

$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $true

$projectRoot = Split-Path -Parent $PSScriptRoot
$pyodideVersion = "314.0.1"
$pyodideArchive = "https://github.com/pyodide/pyodide/releases/download/$pyodideVersion/pyodide-core-$pyodideVersion.tar.bz2"
$pyodideCdn = "https://cdn.jsdelivr.net/pyodide/v$pyodideVersion/full"
$pyodidePackages = @(
  "micropip",
  "ipython",
  "jedi",
  "numpy",
  "pandas",
  "matplotlib",
  "scipy",
  "scikit-learn",
  "pillow"
)
$purePythonRequirements = @(
  "et-xmlfile==2.0.0",
  "openpyxl==3.1.5",
  "seaborn==0.13.2",
  "imbalanced-learn==0.14.0"
)

function Get-NormalizedPackageName([string]$Name) {
  return $Name.ToLowerInvariant().Replace("_", "-").Replace(".", "-")
}

function Move-JavaScriptModule([string]$Directory, [string]$SourceName, [string]$TargetName) {
  $source = Join-Path $Directory $SourceName
  $target = Join-Path $Directory $TargetName
  if (-not (Test-Path -LiteralPath $source)) {
    throw "Expected JavaScript module is missing: $source"
  }
  Move-Item -LiteralPath $source -Destination $target -Force
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
  $localJupyter = Join-Path $projectRoot ".jupyterlite-venv\Scripts\jupyter.exe"
  if (Test-Path $localJupyter) {
    try {
      & $localJupyter --version 2>$null | Out-Null
      if ($LASTEXITCODE -eq 0) { $Jupyter = $localJupyter }
    } catch { $Jupyter = $null }
  }
}
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

Push-Location $projectRoot
try {
  npm run jupyterlite:extension
  npm run labs:runtime
  & $Python (Join-Path $projectRoot "scripts\generate-jupyterlite-notebooks.py")
  if ($LASTEXITCODE -ne 0) {
    throw "Notebook generation failed with exit code $LASTEXITCODE"
  }

  $pipliteWheelsDir = Join-Path $projectRoot "jupyterlite\pypi"
  New-Item -ItemType Directory -Force -Path $pipliteWheelsDir | Out-Null
  foreach ($requirement in $purePythonRequirements) {
    $packageName = (Get-NormalizedPackageName ($requirement.Split("==")[0])).Replace("-", "[-_.]")
    if (-not (Get-ChildItem $pipliteWheelsDir -Filter "*.whl" | Where-Object { $_.BaseName -match "^$packageName[-_.]" })) {
      & $Python -m pip download --disable-pip-version-check --no-deps --only-binary=:all: --dest $pipliteWheelsDir $requirement
      if ($LASTEXITCODE -ne 0) {
        throw "Failed to download the pure Python wheel: $requirement"
      }
    }
  }

  Push-Location (Join-Path $projectRoot "jupyterlite")
  try {
    $buildArgs = @(
      "build",
      "--output-dir", "..\public\lite",
      "--contents", "content",
      "--apps", "lab",
      "--no-sourcemaps",
      "--pyodide", $pyodideArchive,
      "--LiteBuildConfig.federated_extensions=..\jupyterlite-extension\labextension"
    )
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

  $pyodideDir = Join-Path $projectRoot "public\lite\static\pyodide"
  Move-JavaScriptModule $pyodideDir "pyodide.mjs" "pyodide.esm.js"
  Move-JavaScriptModule $pyodideDir "pyodide.asm.mjs" "pyodide.asm.js"
  Move-JavaScriptModule $pyodideDir "python_cli_entry.mjs" "python_cli_entry.js"

  $moduleReferences = @{
    "pyodide.esm.js" = @{
      "pyodide.asm.mjs" = "pyodide.asm.js"
    }
    "pyodide.js" = @{
      "pyodide.asm.mjs" = "pyodide.asm.js"
    }
    "python_cli_entry.js" = @{
      "pyodide.mjs" = "pyodide.esm.js"
    }
    "python" = @{
      "python_cli_entry.mjs" = "python_cli_entry.js"
    }
    "python.bat" = @{
      "python_cli_entry.mjs" = "python_cli_entry.js"
    }
  }
  foreach ($fileName in $moduleReferences.Keys) {
    $path = Join-Path $pyodideDir $fileName
    $source = Get-Content -Raw -LiteralPath $path
    foreach ($reference in $moduleReferences[$fileName].GetEnumerator()) {
      $source = $source.Replace($reference.Key, $reference.Value)
    }
    [System.IO.File]::WriteAllText($path, $source, [System.Text.UTF8Encoding]::new($false))
  }

  & $Python (Join-Path $projectRoot "scripts\patch-jupyterlite-config.py")
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
      curl.exe -L --fail --retry 3 -o $target "$pyodideCdn/$fileName"
    }

    $actualSha256 = (Get-FileHash $target -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actualSha256 -ne $expectedSha256) {
      throw "Pyodide package SHA-256 mismatch for $packageName ($fileName): $actualSha256"
    }
  }

  Write-Host "JupyterLite build complete with self-hosted Pyodide and ONNX Runtime, $($required.Count) verified Pyodide packages, and $($purePythonRequirements.Count) local pure Python wheels."
} finally {
  Pop-Location
}
