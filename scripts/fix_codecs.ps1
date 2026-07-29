param(
    [Parameter(Mandatory=$false)]
    [string]$AlbumPath
)

if (-not $AlbumPath) {
    $scriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { Get-Location }
    $root = Split-Path -Parent $scriptDir
    $AlbumPath = Join-Path $root "assets"
    if (-not (Test-Path $AlbumPath)) {
        $AlbumPath = Join-Path (Get-Location) "assets"
    }
}

Write-Host "--- Music Library Codec Compatibility Builder ---" -ForegroundColor Cyan
Write-Host "Target Path: $AlbumPath"

if (-not (Test-Path $AlbumPath)) {
    Write-Error "Path $AlbumPath does not exist."
    exit 1
}

$ffprobe = Get-Command ffprobe -ErrorAction SilentlyContinue
$ffmpeg = Get-Command ffmpeg -ErrorAction SilentlyContinue

if (-not $ffprobe -or -not $ffmpeg) {
    Write-Error "FFmpeg and FFprobe must be installed and in your PATH."
    exit 1
}

$files = Get-ChildItem -Path $AlbumPath -Filter *.m4a -Recurse |
    Where-Object { $_.BaseName -notmatch '_compatible_aac$' }

$totalProcessed = 0
$totalConverted = 0
$totalSkipped = 0
$totalErrors = 0

foreach ($file in $files) {
    $totalProcessed++
    Write-Host "[$totalProcessed/$($files.Count)] Checking $($file.Name)..." -NoNewline

    $codec = & ffprobe -v error -select_streams a:0 -show_entries stream=codec_name -of default=noprint_wrappers=1:nokey=1 $file.FullName

    if ($codec -eq "alac") {
        $compatiblePath = Join-Path $file.DirectoryName ("$($file.BaseName)_compatible_aac.m4a")

        if (Test-Path $compatiblePath) {
            Write-Host " [SKIP: compatible version already exists]" -ForegroundColor DarkYellow
            $totalSkipped++
            continue
        }

        Write-Host " [ALAC FOUND]" -ForegroundColor Yellow
        Write-Host "  -> Creating AAC compatibility copy (keeps original)..." -ForegroundColor Gray

        & ffmpeg -i $file.FullName -c:a aac -b:a 256k -c:v copy -map_metadata 0 -movflags +faststart -y $compatiblePath 2>$null

        if ($LASTEXITCODE -eq 0 -and (Test-Path $compatiblePath)) {
            (Get-Item $compatiblePath).LastWriteTime = $file.LastWriteTime
            Write-Host "  DONE: Created $([System.IO.Path]::GetFileName($compatiblePath))" -ForegroundColor Green
            $totalConverted++
        }
        else {
            Write-Host "  ERROR: Re-encoding failed." -ForegroundColor Red
            if (Test-Path $compatiblePath) { Remove-Item $compatiblePath -Force }
            $totalErrors++
        }
    }
    else {
        Write-Host " [OK: $codec]" -ForegroundColor DarkGray
    }
}

Write-Host "`n--- Summary ---" -ForegroundColor Cyan
Write-Host "Files Processed: $totalProcessed"
Write-Host "Compatibility Copies Created: $totalConverted"
Write-Host "Already Present (Skipped): $totalSkipped"
Write-Host "Errors Encountered: $totalErrors"
Write-Host "----------------"
