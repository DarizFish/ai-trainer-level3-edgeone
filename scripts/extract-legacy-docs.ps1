param(
  [Parameter(Mandatory = $true)][string]$SourceDir,
  [Parameter(Mandatory = $true)][string]$OutputDir
)

$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

$documents = @(
  @{ Length = 40448; Output = "part1.txt" },
  @{ Length = 682906; Output = "part2.txt" },
  @{ Length = 903904; Output = "part4.txt" },
  @{ Length = 349240; Output = "part6.txt" }
)

$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
$word.AutomationSecurity = 3
$word.Options.ConfirmConversions = $false

try {
  foreach ($item in $documents) {
    $file = Get-ChildItem -LiteralPath $SourceDir -File -Filter "*.doc" |
      Where-Object { $_.Length -eq $item.Length } |
      Select-Object -First 1
    if (-not $file) {
      throw "Reference document with length $($item.Length) was not found."
    }
    $source = $file.FullName
    $target = Join-Path $OutputDir $item.Output
    $document = $word.Documents.OpenNoRepairDialog($source, $false, $true)
    try {
      [IO.File]::WriteAllText(
        $target,
        $document.Content.Text,
        [Text.UTF8Encoding]::new($false)
      )
      Write-Host "Extracted $($item.Output)"
    }
    finally {
      $document.Close(0)
    }
  }
}
finally {
  $word.Quit()
  [Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
}
