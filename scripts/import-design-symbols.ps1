param(
  [Parameter(Mandatory = $true)]
  [string]$SourceZip,
  [string]$OutputRoot = "public/assets/design-reference/sterling-home-symbols",
  [string]$Bucket = "profox-media",
  [string]$R2Prefix = "design-reference/sterling-home-symbols",
  [switch]$Upload
)

$ErrorActionPreference = "Stop"

function Convert-ToSafeSegment {
  param([string]$Value)

  $normalized = $Value.Normalize([Text.NormalizationForm]::FormD)
  $builder = [Text.StringBuilder]::new()
  foreach ($character in $normalized.ToCharArray()) {
    if ([Globalization.CharUnicodeInfo]::GetUnicodeCategory($character) -ne [Globalization.UnicodeCategory]::NonSpacingMark) {
      [void]$builder.Append($character)
    }
  }

  $safe = $builder.ToString().ToLowerInvariant()
  $safe = $safe -replace '[^a-z0-9._-]+', '-'
  $safe = $safe -replace '-{2,}', '-'
  return $safe.Trim('-', '.')
}

function Convert-ToSafeRelativePath {
  param([string]$ArchivePath)

  $segments = $ArchivePath -split '[\\/]'
  $safeSegments = foreach ($segment in $segments) {
    $safe = Convert-ToSafeSegment $segment
    if ([string]::IsNullOrWhiteSpace($safe)) {
      throw "Archive path contains an unusable segment: $ArchivePath"
    }
    $safe
  }
  return [string]::Join('/', $safeSegments)
}

if (-not (Test-Path -LiteralPath $SourceZip -PathType Leaf)) {
  throw "Source ZIP was not found: $SourceZip"
}

$resolvedOutput = [IO.Path]::GetFullPath((Join-Path (Get-Location) $OutputRoot))
$workspaceRoot = [IO.Path]::GetFullPath((Get-Location).Path)
if (-not $resolvedOutput.StartsWith($workspaceRoot, [StringComparison]::OrdinalIgnoreCase)) {
  throw "Output directory must remain inside the workspace."
}
if (Test-Path -LiteralPath $resolvedOutput) {
  throw "Output directory already exists: $resolvedOutput"
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::OpenRead($SourceZip)
$utf8 = [Text.UTF8Encoding]::new($false)
$seen = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
$assets = [Collections.Generic.List[object]]::new()
$excluded = [Collections.Generic.List[object]]::new()

try {
  $fileEntries = @($archive.Entries | Where-Object { -not [string]::IsNullOrWhiteSpace($_.Name) })
  foreach ($entry in $fileEntries) {
    if ([IO.Path]::IsPathRooted($entry.FullName) -or $entry.FullName -match '(^|[\\/])\.\.([\\/]|$)') {
      throw "Unsafe archive path: $($entry.FullName)"
    }
    if ([IO.Path]::GetExtension($entry.Name).ToLowerInvariant() -ne '.svg') {
      throw "Unsupported file type in archive: $($entry.FullName)"
    }
    if ($entry.Length -gt 2MB) {
      throw "SVG exceeds the 2 MB import limit: $($entry.FullName)"
    }

    $reader = [IO.StreamReader]::new($entry.Open())
    try {
      $svg = $reader.ReadToEnd()
    } finally {
      $reader.Dispose()
    }

    if ($svg -match '(?i)<script\b|\son[a-z]+\s*=|<foreignObject\b') {
      throw "Active SVG content is not allowed: $($entry.FullName)"
    }
    if ($svg -match '(?i)(?:href|xlink:href)\s*=\s*["''](?:https?:|//)' -or $svg -match '(?i)url\(\s*["'']?(?:https?:|//)') {
      throw "External SVG references are not allowed: $($entry.FullName)"
    }

    if ($entry.FullName -eq 'elm/filters/chips/user.svg') {
      $excluded.Add([ordered]@{
        originalPath = $entry.FullName
        reason = 'Excluded by the project visual policy because the embedded female portrait is not in modest Islamic attire.'
      })
      continue
    }

    $relativePath = Convert-ToSafeRelativePath $entry.FullName
    if (-not $seen.Add($relativePath)) {
      throw "Normalized asset path collision: $relativePath"
    }

    $destination = Join-Path $resolvedOutput ($relativePath -replace '/', [IO.Path]::DirectorySeparatorChar)
    $destinationDirectory = Split-Path -Parent $destination
    [IO.Directory]::CreateDirectory($destinationDirectory) | Out-Null
    [IO.File]::WriteAllText($destination, $svg, $utf8)

    $assets.Add([ordered]@{
      originalPath = $entry.FullName
      localPath = "/assets/design-reference/sterling-home-symbols/$relativePath"
      r2Key = "$R2Prefix/$relativePath"
      contentType = 'image/svg+xml'
      bytes = ([IO.FileInfo]$destination).Length
    })
  }
} finally {
  $archive.Dispose()
}

$manifest = [ordered]@{
  sourceArchive = [IO.Path]::GetFileName($SourceZip)
  importedCount = $assets.Count
  excludedCount = $excluded.Count
  r2Bucket = $Bucket
  r2Prefix = $R2Prefix
  assets = $assets
  excluded = $excluded
}
$manifestPath = Join-Path $resolvedOutput '_manifest.json'
[IO.File]::WriteAllText($manifestPath, ($manifest | ConvertTo-Json -Depth 6), $utf8)

Write-Output "Imported $($assets.Count) SVG assets; excluded $($excluded.Count)."

if ($Upload) {
  $index = 0
  foreach ($asset in $assets) {
    $index++
    $relativeAssetPath = $asset.r2Key.Substring($R2Prefix.Length).TrimStart('/')
    $localFile = Join-Path $resolvedOutput ($relativeAssetPath -replace '/', [IO.Path]::DirectorySeparatorChar)
    $objectPath = "$Bucket/$($asset.r2Key)"
    $output = & npx.cmd wrangler r2 object put $objectPath --file $localFile --content-type image/svg+xml --cache-control "public, max-age=31536000, immutable" --remote 2>&1
    if ($LASTEXITCODE -ne 0) {
      throw "R2 upload failed for $objectPath`n$($output -join [Environment]::NewLine)"
    }
    if ($index % 10 -eq 0 -or $index -eq $assets.Count) {
      Write-Output "Uploaded $index/$($assets.Count) assets."
    }
  }

  $manifestObject = "$Bucket/$R2Prefix/_manifest.json"
  $manifestOutput = & npx.cmd wrangler r2 object put $manifestObject --file $manifestPath --content-type application/json --cache-control "public, max-age=300" --remote 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "R2 manifest upload failed.`n$($manifestOutput -join [Environment]::NewLine)"
  }
  Write-Output "Uploaded manifest to $manifestObject."
}
