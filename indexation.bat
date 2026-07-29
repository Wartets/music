<# :
@echo off
title Music Indexer
color 0B
echo Initializing indexing...
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; iex (Get-Content '%~f0' -Raw -Encoding UTF8)"
pause
exit /b
#>

$root = Get-Location | Select-Object -ExpandProperty Path
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$output = Join-Path $root "musicBib.json"
$shell = New-Object -ComObject Shell.Application

# Define assets folder
$assetsFolder = "assets"
$assetsPath = Join-Path $root $assetsFolder

# Loading image library to analyze color and ratio
Add-Type -AssemblyName System.Drawing

# Supported extensions
$audioExt = @('.mp3','.wav','.flac','.m4a','.aif','.aiff','.ogg','.wma','.opus')
$losslessExt = @('.wav','.flac','.aif','.aiff')
$imgExt = @('.jpg','.jpeg','.png','.bmp','.tiff','.webp')

# Cache for shell metadata columns to avoid hardcoded indexes.
$global:metadataColumnMap = $null
$global:ffprobeTagCache = @{}
$global:ffprobeAvailable = [bool](Get-Command ffprobe -ErrorAction SilentlyContinue)
$global:ffmpegAvailable = [bool](Get-Command ffmpeg -ErrorAction SilentlyContinue)
$global:bpmAnalysisCache = @{}

# Dictionary to cache image analysis (avoid recalculating the same image 50 times)
$global:imageCache = @{}

# Function to get a clean relative path
function Get-Rel($p, $b) {
    if (!$p) { return "" }
    $path = $p.ToString()
    $rel = $path.Replace($b, "").TrimStart("\")
    if (!$rel) { return "." }
    return $rel
}

# Normalize shell column names for robust matching across locales (FR/EN/etc).
function Normalize-DetailKey($value) {
    if ([string]::IsNullOrWhiteSpace($value)) {
        return ""
    }

    $formD = $value.Normalize([Text.NormalizationForm]::FormD)
    $builder = New-Object System.Text.StringBuilder
    foreach ($char in $formD.ToCharArray()) {
        $category = [Globalization.CharUnicodeInfo]::GetUnicodeCategory($char)
        if ($category -ne [Globalization.UnicodeCategory]::NonSpacingMark) {
            [void]$builder.Append($char)
        }
    }

    $normalized = $builder.ToString().ToLowerInvariant()
    $normalized = $normalized -replace '[^a-z0-9]+', ' '
    $normalized = ($normalized -replace '\s+', ' ').Trim()
    return $normalized
}

function Get-MetadataColumnMap($folderObject) {
    $map = @{}

    for ($i = 0; $i -le 400; $i++) {
        $columnName = $folderObject.GetDetailsOf($null, $i)
        if ([string]::IsNullOrWhiteSpace($columnName)) {
            continue
        }

        $key = Normalize-DetailKey $columnName
        if ($key -and -not $map.ContainsKey($key)) {
            $map[$key] = $i
        }
    }

    return $map
}

function Get-DetailValue {
    param(
        $FolderObject,
        $Item,
        $ColumnMap,
        [string[]]$ColumnCandidates,
        [int[]]$FallbackIndices = @()
    )

    foreach ($candidate in $ColumnCandidates) {
        $key = Normalize-DetailKey $candidate
        if ($key -and $ColumnMap.ContainsKey($key)) {
            $index = [int]$ColumnMap[$key]
            $value = [string]$FolderObject.GetDetailsOf($Item, $index)
            if (-not [string]::IsNullOrWhiteSpace($value)) {
                return $value.Trim()
            }
        }
    }

    foreach ($index in $FallbackIndices) {
        $value = [string]$FolderObject.GetDetailsOf($Item, $index)
        if (-not [string]::IsNullOrWhiteSpace($value)) {
            return $value.Trim()
        }
    }

    return ""
}

function Get-UniqueNormalizedValues {
    param([string[]]$Values)

    $seen = @{}
    $result = @()

    foreach ($value in $Values) {
        if ([string]::IsNullOrWhiteSpace($value)) {
            continue
        }

        $trimmed = $value.Trim()
        $key = $trimmed.ToLowerInvariant()
        if (-not $seen.ContainsKey($key)) {
            $seen[$key] = $true
            $result += $trimmed
        }
    }

    return $result
}

function Get-FFprobeTags {
    param([string]$FilePath)

    if ($global:ffprobeTagCache.ContainsKey($FilePath)) {
        return $global:ffprobeTagCache[$FilePath]
    }

    $tagsMap = @{}

    if (-not $global:ffprobeAvailable) {
        $global:ffprobeTagCache[$FilePath] = $tagsMap
        return $tagsMap
    }

    try {
        $json = & ffprobe -v quiet -print_format json -show_format -show_streams -- "$FilePath" 2>$null
        if ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace($json)) {
            $probe = $json | ConvertFrom-Json

            if ($probe.format -and $probe.format.tags) {
                foreach ($property in $probe.format.tags.PSObject.Properties) {
                    $key = Normalize-DetailKey $property.Name
                    $value = [string]$property.Value
                    if ($key -and -not [string]::IsNullOrWhiteSpace($value) -and -not $tagsMap.ContainsKey($key)) {
                        $tagsMap[$key] = $value.Trim()
                    }
                }
            }

            if ($probe.streams) {
                foreach ($stream in $probe.streams) {
                    if (-not $stream.tags) { continue }
                    foreach ($property in $stream.tags.PSObject.Properties) {
                        $key = Normalize-DetailKey $property.Name
                        $value = [string]$property.Value
                        if ($key -and -not [string]::IsNullOrWhiteSpace($value) -and -not $tagsMap.ContainsKey($key)) {
                            $tagsMap[$key] = $value.Trim()
                        }
                    }
                }
            }
        }
    } catch {
        # Keep empty tag map if ffprobe fails for this file.
    }

    $global:ffprobeTagCache[$FilePath] = $tagsMap
    return $tagsMap
}

function Get-TagValue {
    param(
        $TagMap,
        [string[]]$TagCandidates
    )

    foreach ($candidate in $TagCandidates) {
        $key = Normalize-DetailKey $candidate
        if ($key -and $TagMap.ContainsKey($key)) {
            $value = [string]$TagMap[$key]
            if (-not [string]::IsNullOrWhiteSpace($value)) {
                return $value.Trim()
            }
        }
    }

    return ""
}

# Optional BPM analysis fallback when metadata tags are missing.
function Get-AnalyzedBpm {
    param([string]$FilePath)

    if ([string]::IsNullOrWhiteSpace($FilePath)) {
        return ""
    }

    if ($global:bpmAnalysisCache.ContainsKey($FilePath)) {
        return [string]$global:bpmAnalysisCache[$FilePath]
    }

    if (-not $global:ffmpegAvailable) {
        $global:bpmAnalysisCache[$FilePath] = ""
        return ""
    }

    $detectedBpm = ""

    try {
        $analysisOutput = & ffmpeg -hide_banner -nostats -t 180 -i "$FilePath" -vn -af "bpm" -f null NUL 2>&1
        if ($analysisOutput) {
            foreach ($line in $analysisOutput) {
                if ($line -match '(?i)\bbpm\b[^0-9]*([0-9]+(?:[\.,][0-9]+)?)') {
                    $raw = $matches[1] -replace ',', '.'
                    $parsed = 0.0
                    if ([double]::TryParse($raw, [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$parsed)) {
                        if ($parsed -gt 0 -and $parsed -lt 300) {
                            $detectedBpm = ([int][math]::Round($parsed)).ToString()
                        }
                    }
                }
            }
        }
    } catch {
        $detectedBpm = ""
    }

    $global:bpmAnalysisCache[$FilePath] = $detectedBpm
    return $detectedBpm
}

# Normalize artist metadata into a stable string array.
function Get-NormalizedArtists($rawValue) {
    $rawText = [string]$rawValue
    if ([string]::IsNullOrWhiteSpace($rawText)) {
        return @()
    }

    $tokens = $rawText -split '\s*(?:;|\||\\\\|/|,|\bfeat\.?\b|\bfeaturing\b|\bft\.?\b)\s*'
    $artists = @(
        $tokens |
            ForEach-Object { $_.Trim() } |
            Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
            Select-Object -Unique
    )

    return $artists
}

# Function to deeply analyze an image (Color, Ratio, Dimensions)
function Get-ImageDetails($imgPath) {
    if ($imageCache.ContainsKey($imgPath)) {
        return $imageCache[$imgPath]
    }

    $fileInfo = Get-Item -LiteralPath $imgPath

    $toHex = {
        param($r,$g,$b)
        "#{0:X2}{1:X2}{2:X2}" -f [int]$r,[int]$g,[int]$b
    }

    $rgbToHsl = {
        param([double]$r,[double]$g,[double]$b)
        $rf=$r/255.0; $gf=$g/255.0; $bf=$b/255.0
        $mx=[Math]::Max($rf,[Math]::Max($gf,$bf))
        $mn=[Math]::Min($rf,[Math]::Min($gf,$bf))
        $l=($mx+$mn)/2.0; $d=$mx-$mn; $s=0.0; $h=0.0
        if ($d -gt 0) {
            $s = if ($l -lt 0.5) { $d/($mx+$mn) } else { $d/(2.0-$mx-$mn) }
            if     ($mx -eq $rf) { $h=(($gf-$bf)/$d) }
            elseif ($mx -eq $gf) { $h=(($bf-$rf)/$d)+2 }
            else                 { $h=(($rf-$gf)/$d)+4 }
            $h*=60; if ($h -lt 0) { $h+=360 }
        }
        [pscustomobject]@{ h=$h; s=$s; l=$l }
    }

    $hslToHex = {
        param([double]$h,[double]$s,[double]$l)
        $c=(1 - [Math]::Abs(2*$l - 1)) * $s
        $hp=$h/60.0
        $x=$c * (1 - [Math]::Abs(($hp % 2) - 1))
        $r1=0.0;$g1=0.0;$b1=0.0
        if     ($hp -lt 1) { $r1=$c;$g1=$x }
        elseif ($hp -lt 2) { $r1=$x;$g1=$c }
        elseif ($hp -lt 3) { $g1=$c;$b1=$x }
        elseif ($hp -lt 4) { $g1=$x;$b1=$c }
        elseif ($hp -lt 5) { $r1=$x;$b1=$c }
        else               { $r1=$c;$b1=$x }
        $m=$l - $c/2.0
        $r=[int][Math]::Round(($r1+$m)*255)
        $g=[int][Math]::Round(($g1+$m)*255)
        $b=[int][Math]::Round(($b1+$m)*255)
        & $toHex $r $g $b
    }

    $relLum = {
        param([double]$r,[double]$g,[double]$b)
        $lin = {
            param($c)
            $v=$c/255.0
            if ($v -le 0.03928) { return $v/12.92 }
            return [Math]::Pow(($v+0.055)/1.055, 2.4)
        }
        0.2126*(& $lin $r) + 0.7152*(& $lin $g) + 0.0722*(& $lin $b)
    }

    # Default skeleton, returned as-is if analysis fails.
    $width=0; $height=0; $ratio="Unknown"
    $emptyResult = [ordered]@{
        name           = $fileInfo.Name
        type           = $fileInfo.Extension.Replace('.','').ToUpper()
        path           = Get-Rel $imgPath $Root
        size_bytes     = $fileInfo.Length
        dimensions     = "$width x $height"
        aspect_ratio   = $ratio
        dominant_color = "#000000"
        average_color  = "#000000"
        vibrant_color  = "#000000"
        muted_color    = "#000000"
        dark_color     = "#000000"
        light_color    = "#FFFFFF"
        accent_color   = "#000000"
        stats          = [ordered]@{}
        color_palette  = @()
        hue_histogram  = @()
        saturation_histogram = @()
        lightness_histogram  = @()
        regions        = [ordered]@{}
        harmony        = [ordered]@{}
    }

    try {
        $bmp = New-Object System.Drawing.Bitmap($imgPath)
        $width = $bmp.Width; $height = $bmp.Height
        if ($width -eq $height) { $ratio="Square" }
        elseif ($width -gt $height) { $ratio="Landscape" }
        else { $ratio="Portrait" }

        # Higher-resolution sample (128x128 = 16384 pixels) via LockBits for speed.
        $target = 128
        $sw = [Math]::Max(32, [Math]::Min($target, $width))
        $sh = [Math]::Max(32, [Math]::Min($target, $height))
        $sample = New-Object System.Drawing.Bitmap($bmp, $sw, $sh)
        $rect = New-Object System.Drawing.Rectangle(0,0,$sw,$sh)
        $data = $sample.LockBits($rect,
            [System.Drawing.Imaging.ImageLockMode]::ReadOnly,
            [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
        $stride = $data.Stride
        $bytes = New-Object byte[] ($stride * $sh)
        [System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $bytes.Length)
        $sample.UnlockBits($data)
        $sample.Dispose(); $bmp.Dispose()

        $totalCount = 0
        $sumR=0.0; $sumG=0.0; $sumB=0.0
        $sumL=0.0; $sumL2=0.0
        $sumS=0.0; $sumS2=0.0
        $sumRG=0.0; $sumRG2=0.0
        $sumYB=0.0; $sumYB2=0.0
        $lValues = New-Object System.Collections.Generic.List[double]
        $sValues = New-Object System.Collections.Generic.List[double]

        $buckets = @{}
        $hueBins   = New-Object double[] 12    # 30° bins
        $satBins   = New-Object double[] 10    # 0.1 bins
        $lightBins = New-Object double[] 10
        $warmCount=0.0; $coolCount=0.0; $neutralCount=0.0

        # 3x3 spatial grid
        $regR = New-Object 'double[,]' 3,3
        $regG = New-Object 'double[,]' 3,3
        $regB = New-Object 'double[,]' 3,3
        $regN = New-Object 'int[,]' 3,3

        for ($y=0; $y -lt $sh; $y++) {
            $rowBase = $y * $stride
            $ry = if ($y -lt $sh/3) { 0 } elseif ($y -lt 2*$sh/3) { 1 } else { 2 }
            for ($x=0; $x -lt $sw; $x++) {
                $idx = $rowBase + $x*4
                $b = [int]$bytes[$idx]
                $g = [int]$bytes[$idx+1]
                $r = [int]$bytes[$idx+2]
                $a = [int]$bytes[$idx+3]
                if ($a -lt 16) { continue }

                $totalCount++
                $sumR+=$r; $sumG+=$g; $sumB+=$b

                $rx = if ($x -lt $sw/3) { 0 } elseif ($x -lt 2*$sw/3) { 1 } else { 2 }
                $regR[$ry,$rx]+=$r; $regG[$ry,$rx]+=$g; $regB[$ry,$rx]+=$b
                $regN[$ry,$rx]++

                $hsl = & $rgbToHsl $r $g $b
                $hv=$hsl.h; $sv=$hsl.s; $lv=$hsl.l

                $sumL+=$lv; $sumL2+=$lv*$lv
                $sumS+=$sv; $sumS2+=$sv*$sv
                $lValues.Add($lv); $sValues.Add($sv)

                # Hasler & Süsstrunk colorfulness opponents
                $rgOp = $r - $g
                $ybOp = 0.5*($r + $g) - $b
                $sumRG+=$rgOp; $sumRG2+=$rgOp*$rgOp
                $sumYB+=$ybOp; $sumYB2+=$ybOp*$ybOp

                $sbi=[int][Math]::Floor($sv*10); if ($sbi -ge 10) { $sbi=9 }
                $lbi=[int][Math]::Floor($lv*10); if ($lbi -ge 10) { $lbi=9 }
                $satBins[$sbi]++
                $lightBins[$lbi]++

                if ($sv -ge 0.12) {
                    $hbi=[int][Math]::Floor($hv/30); if ($hbi -ge 12) { $hbi=11 }
                    $hueBins[$hbi]++
                    if (($hv -le 60) -or ($hv -ge 300)) { $warmCount++ }
                    elseif ($hv -ge 180 -and $hv -le 250) { $coolCount++ }
                    else { $neutralCount++ }
                } else {
                    $neutralCount++
                }

                # Quantization for clustering: fine HSL buckets
                $qH = if ($sv -lt 0.08) { -1 } else {
                    $v=[int][Math]::Floor($hv/10); if ($v -ge 36) { 35 } else { $v }
                }
                $qS=[int][Math]::Floor($sv*8); if ($qS -ge 8) { $qS=7 }
                $qL=[int][Math]::Floor($lv*10); if ($qL -ge 10) { $qL=9 }
                $key="$qH|$qS|$qL"
                if ($buckets.ContainsKey($key)) {
                    $bk=$buckets[$key]
                    $bk.count++
                    $bk.sumR+=$r; $bk.sumG+=$g; $bk.sumB+=$b
                    $bk.sumS+=$sv; $bk.sumL+=$lv
                    $bk.sumHx+=[Math]::Cos($hv*[Math]::PI/180.0)
                    $bk.sumHy+=[Math]::Sin($hv*[Math]::PI/180.0)
                } else {
                    $buckets[$key]=[ordered]@{
                        count=1
                        sumR=[double]$r; sumG=[double]$g; sumB=[double]$b
                        sumS=[double]$sv; sumL=[double]$lv
                        sumHx=[Math]::Cos($hv*[Math]::PI/180.0)
                        sumHy=[Math]::Sin($hv*[Math]::PI/180.0)
                    }
                }
            }
        }

        if ($totalCount -eq 0) {
            $imageCache[$imgPath]=$emptyResult
            return $emptyResult
        }

        # --- Aggregates ------------------------------------------------------
        $avgR=[int][Math]::Round($sumR/$totalCount)
        $avgG=[int][Math]::Round($sumG/$totalCount)
        $avgB=[int][Math]::Round($sumB/$totalCount)
        $averageColor = & $toHex $avgR $avgG $avgB

        $meanL = $sumL/$totalCount
        $meanS = $sumS/$totalCount
        $varL  = [Math]::Max(0.0, ($sumL2/$totalCount) - $meanL*$meanL)
        $varS  = [Math]::Max(0.0, ($sumS2/$totalCount) - $meanS*$meanS)
        $stdL  = [Math]::Sqrt($varL)
        $stdS  = [Math]::Sqrt($varS)

        $lValues.Sort(); $sValues.Sort()
        $medianL = $lValues[[int]($lValues.Count/2)]
        $medianS = $sValues[[int]($sValues.Count/2)]

        # Colorfulness (Hasler & Süsstrunk, normalized 0-1 at ~100)
        $meanRG = $sumRG/$totalCount; $meanYB = $sumYB/$totalCount
        $stdRG  = [Math]::Sqrt([Math]::Max(0.0, ($sumRG2/$totalCount) - $meanRG*$meanRG))
        $stdYB  = [Math]::Sqrt([Math]::Max(0.0, ($sumYB2/$totalCount) - $meanYB*$meanYB))
        $colorfulnessRaw = [Math]::Sqrt($stdRG*$stdRG + $stdYB*$stdYB) + 0.3*[Math]::Sqrt($meanRG*$meanRG + $meanYB*$meanYB)
        $colorfulness = [Math]::Round([Math]::Min(1.0, $colorfulnessRaw/100.0), 3)

        $warmPct    = [Math]::Round(100.0 * $warmCount    / $totalCount, 2)
        $coolPct    = [Math]::Round(100.0 * $coolCount    / $totalCount, 2)
        $neutralPct = [Math]::Round(100.0 * $neutralCount / $totalCount, 2)
        $temperature = if ($warmPct -gt $coolPct + 10) { "warm" }
                       elseif ($coolPct -gt $warmPct + 10) { "cool" }
                       else { "neutral" }

        # --- Clusters: centroids + greedy perceptual merge -------------------
        $rawClusters = foreach ($kv in $buckets.GetEnumerator()) {
            $c=$kv.Value
            $hx=$c.sumHx/$c.count; $hy=$c.sumHy/$c.count
            $hAvg=[Math]::Atan2($hy,$hx)*180.0/[Math]::PI
            if ($hAvg -lt 0) { $hAvg+=360 }
            [pscustomobject]@{
                count=[int]$c.count
                r=$c.sumR/$c.count; g=$c.sumG/$c.count; b=$c.sumB/$c.count
                h=$hAvg; s=$c.sumS/$c.count; l=$c.sumL/$c.count
            }
        }
        $sorted = @($rawClusters | Sort-Object -Property count -Descending)

        $merged = New-Object System.Collections.Generic.List[object]
        foreach ($c in $sorted) {
            $absorbed=$false
            foreach ($m in $merged) {
                $dh=[Math]::Abs($m.h - $c.h); if ($dh -gt 180) { $dh=360-$dh }
                $ds=[Math]::Abs($m.s - $c.s)
                $dl=[Math]::Abs($m.l - $c.l)
                $bothGrey = ($m.s -lt 0.12) -and ($c.s -lt 0.12)
                $hueClose = $bothGrey -or ($dh -lt 15)
                if ($hueClose -and $ds -lt 0.15 -and $dl -lt 0.10) {
                    $tot = $m.count + $c.count
                    $m.r=($m.r*$m.count + $c.r*$c.count)/$tot
                    $m.g=($m.g*$m.count + $c.g*$c.count)/$tot
                    $m.b=($m.b*$m.count + $c.b*$c.count)/$tot
                    $m.s=($m.s*$m.count + $c.s*$c.count)/$tot
                    $m.l=($m.l*$m.count + $c.l*$c.count)/$tot
                    $m.count=$tot
                    $absorbed=$true; break
                }
            }
            if (-not $absorbed) {
                $merged.Add([pscustomobject]@{ count=$c.count; r=$c.r; g=$c.g; b=$c.b; h=$c.h; s=$c.s; l=$c.l })
            }
        }
        $mergedSorted = @($merged | Sort-Object -Property count -Descending)
        $uniqueClusters = $mergedSorted.Count

        # --- Key colors ------------------------------------------------------
        $d = $mergedSorted[0]
        $dominantColor = & $toHex ([Math]::Round($d.r)) ([Math]::Round($d.g)) ([Math]::Round($d.b))
        $dominantHSL   = [pscustomobject]@{ h=$d.h; s=$d.s; l=$d.l }

        # Vibrant: best saturation, mid lightness, with coverage support
        $bestVib=-1.0; $vibrantColor=$dominantColor
        foreach ($c in $mergedSorted) {
            if ($c.s -lt 0.30 -or $c.l -lt 0.18 -or $c.l -gt 0.88) { continue }
            $w=$c.count/[double]$totalCount
            $score=$c.s*0.65 + $w*0.35
            if ($score -gt $bestVib) { $bestVib=$score; $vibrantColor=& $toHex ([Math]::Round($c.r)) ([Math]::Round($c.g)) ([Math]::Round($c.b)) }
        }

        # Muted
        $bestMut=-1.0; $mutedColor=$dominantColor
        foreach ($c in $mergedSorted) {
            if ($c.s -gt 0.35) { continue }
            $w=$c.count/[double]$totalCount
            $balance=1.0 - [Math]::Abs($c.l - 0.5)*2
            $score=$balance*0.5 + $w*0.5
            if ($score -gt $bestMut) { $bestMut=$score; $mutedColor=& $toHex ([Math]::Round($c.r)) ([Math]::Round($c.g)) ([Math]::Round($c.b)) }
        }

        # Dark/Light anchors (among significant clusters ≥3 %)
        $significant = @($mergedSorted | Where-Object { ($_.count/[double]$totalCount) -gt 0.03 })
        if ($significant.Count -eq 0) { $significant = $mergedSorted }
        $darkC  = $significant | Sort-Object -Property l | Select-Object -First 1
        $lightC = $significant | Sort-Object -Property l -Descending | Select-Object -First 1
        $darkColor  = & $toHex ([Math]::Round($darkC.r))  ([Math]::Round($darkC.g))  ([Math]::Round($darkC.b))
        $lightColor = & $toHex ([Math]::Round($lightC.r)) ([Math]::Round($lightC.g)) ([Math]::Round($lightC.b))

        # Accent: most saturated cluster different in hue from dominant
        $accentColor = $vibrantColor
        $bestAcc=-1.0
        foreach ($c in $mergedSorted) {
            $dh=[Math]::Abs($c.h - $dominantHSL.h); if ($dh -gt 180) { $dh=360-$dh }
            if ($dh -lt 30) { continue }
            if ($c.s -lt 0.35) { continue }
            $w=$c.count/[double]$totalCount
            $score=$c.s*0.6 + $dh/180.0*0.25 + $w*0.15
            if ($score -gt $bestAcc) { $bestAcc=$score; $accentColor=& $toHex ([Math]::Round($c.r)) ([Math]::Round($c.g)) ([Math]::Round($c.b)) }
        }

        # Contrast ratio (WCAG) between dark and light anchors
        $lumDark  = & $relLum $darkC.r  $darkC.g  $darkC.b
        $lumLight = & $relLum $lightC.r $lightC.g $lightC.b
        $contrastRatio = [Math]::Round(($lumLight + 0.05) / ($lumDark + 0.05), 3)

        # --- Rich palette (up to 10) with roles and percentages --------------
        $paletteCount = [Math]::Min(10, $mergedSorted.Count)
        $palette = @()
        for ($i=0; $i -lt $paletteCount; $i++) {
            $c = $mergedSorted[$i]
            $hex = & $toHex ([Math]::Round($c.r)) ([Math]::Round($c.g)) ([Math]::Round($c.b))
            $pct = [Math]::Round(100.0 * $c.count / $totalCount, 2)
            $role = if ($i -eq 0) { "dominant" }
                    elseif ($c.l -lt 0.25) { "shadow" }
                    elseif ($c.l -gt 0.80) { "highlight" }
                    elseif ($c.s -ge 0.45) { "accent" }
                    elseif ($c.s -lt 0.20) { "neutral" }
                    else { "secondary" }
            $isWarm = (($c.h -le 60) -or ($c.h -ge 300)) -and ($c.s -ge 0.12)
            $isCool = ($c.h -ge 180 -and $c.h -le 250) -and ($c.s -ge 0.12)
            $palette += [ordered]@{
                hex                = $hex
                rgb                = [ordered]@{ r=[int][Math]::Round($c.r); g=[int][Math]::Round($c.g); b=[int][Math]::Round($c.b) }
                hsl                = [ordered]@{ h=[int][Math]::Round($c.h); s=[Math]::Round($c.s,3); l=[Math]::Round($c.l,3) }
                coverage_percent   = $pct
                coverage_weight    = [Math]::Round($c.count/[double]$totalCount, 4)
                role               = $role
                is_warm            = $isWarm
                is_cool            = $isCool
                is_neutral         = (-not $isWarm -and -not $isCool)
                relative_luminance = [Math]::Round((& $relLum $c.r $c.g $c.b), 4)
            }
        }

        # --- Histograms ------------------------------------------------------
        $hueHist = for ($i=0; $i -lt 12; $i++) {
            $pct = [Math]::Round(100.0 * $hueBins[$i] / $totalCount, 2)
            $sampleHex = & $hslToHex ($i*30 + 15) 0.65 0.5
            [ordered]@{
                range_start  = $i*30
                range_end    = ($i+1)*30
                percent      = $pct
                sample_color = $sampleHex
            }
        }
        $satHist = for ($i=0; $i -lt 10; $i++) {
            [ordered]@{
                range_start = [Math]::Round($i*0.1, 1)
                range_end   = [Math]::Round(($i+1)*0.1, 1)
                percent     = [Math]::Round(100.0 * $satBins[$i] / $totalCount, 2)
            }
        }
        $lightHist = for ($i=0; $i -lt 10; $i++) {
            [ordered]@{
                range_start = [Math]::Round($i*0.1, 1)
                range_end   = [Math]::Round(($i+1)*0.1, 1)
                percent     = [Math]::Round(100.0 * $lightBins[$i] / $totalCount, 2)
            }
        }

        # --- Spatial regions (3x3) ------------------------------------------
        $regionLabels = @(
            @('top_left','top','top_right'),
            @('left','center','right'),
            @('bottom_left','bottom','bottom_right')
        )
        $regions = [ordered]@{}
        for ($ry=0; $ry -lt 3; $ry++) {
            for ($rx=0; $rx -lt 3; $rx++) {
                $n = $regN[$ry,$rx]
                if ($n -gt 0) {
                    $sumRv = $regR[$ry,$rx]
                    $sumGv = $regG[$ry,$rx]
                    $sumBv = $regB[$ry,$rx]
                    $rr = [int][Math]::Round($sumRv / $n)
                    $gg = [int][Math]::Round($sumGv / $n)
                    $bb = [int][Math]::Round($sumBv / $n)
                    $regions[$regionLabels[$ry][$rx]] = [ordered]@{
                        hex        = & $toHex $rr $gg $bb
                        brightness = [Math]::Round((& $relLum $rr $gg $bb), 4)
                    }
                }
            }
        }

        # --- Harmony suggestions based on dominant --------------------------
        $dh=$dominantHSL.h; $ds=$dominantHSL.s; $dl=$dominantHSL.l
        $dsHarm=[Math]::Max(0.40,$ds); $dlHarm=[Math]::Max(0.35,[Math]::Min(0.65,$dl))
        $harmony = [ordered]@{
            complementary       = & $hslToHex (($dh+180)%360) $dsHarm $dlHarm
            analogous           = @(
                (& $hslToHex (($dh+30)%360) $dsHarm $dlHarm),
                (& $hslToHex ((($dh-30)+360)%360) $dsHarm $dlHarm)
            )
            triadic             = @(
                (& $hslToHex (($dh+120)%360) $dsHarm $dlHarm),
                (& $hslToHex (($dh+240)%360) $dsHarm $dlHarm)
            )
            split_complementary = @(
                (& $hslToHex (($dh+150)%360) $dsHarm $dlHarm),
                (& $hslToHex (($dh+210)%360) $dsHarm $dlHarm)
            )
        }

        # --- Booleans for quick filtering -----------------------------------
        $isDark        = $meanL -lt 0.30
        $isLight       = $meanL -gt 0.70
        $isVibrant     = $meanS -gt 0.45 -and $colorfulness -gt 0.35
        $isMuted       = $meanS -lt 0.20
        $isMonochrome  = ($palette | Where-Object { $_.coverage_percent -ge 5 } | Measure-Object).Count -le 2
        $isGrayscale   = $meanS -lt 0.08
        $isHighContrast = $contrastRatio -gt 7.0

        $stats = [ordered]@{
            total_pixels_analyzed = $totalCount
            unique_clusters       = $uniqueClusters
            brightness_mean       = [Math]::Round($meanL,3)
            brightness_median     = [Math]::Round($medianL,3)
            brightness_stddev     = [Math]::Round($stdL,3)
            saturation_mean       = [Math]::Round($meanS,3)
            saturation_median     = [Math]::Round($medianS,3)
            saturation_stddev     = [Math]::Round($stdS,3)
            contrast_ratio        = $contrastRatio
            colorfulness          = $colorfulness
            warm_percent          = $warmPct
            cool_percent          = $coolPct
            neutral_percent       = $neutralPct
            temperature           = $temperature
            is_dark               = $isDark
            is_light              = $isLight
            is_vibrant            = $isVibrant
            is_muted              = $isMuted
            is_monochrome         = $isMonochrome
            is_grayscale          = $isGrayscale
            is_high_contrast      = $isHighContrast
        }

        $result = [ordered]@{
            name           = $fileInfo.Name
            type           = $fileInfo.Extension.Replace('.','').ToUpper()
            path           = Get-Rel $imgPath $Root
            size_bytes     = $fileInfo.Length
            dimensions     = "$width x $height"
            aspect_ratio   = $ratio
            dominant_color = $dominantColor
            average_color  = $averageColor
            vibrant_color  = $vibrantColor
            muted_color    = $mutedColor
            dark_color     = $darkColor
            light_color    = $lightColor
            accent_color   = $accentColor
            stats          = $stats
            color_palette  = @($palette)
            hue_histogram         = @($hueHist)
            saturation_histogram  = @($satHist)
            lightness_histogram   = @($lightHist)
            regions        = $regions
            harmony        = $harmony
        }

        $imageCache[$imgPath] = $result
        return $result
    } catch {
        $imageCache[$imgPath] = $emptyResult
        return $emptyResult
    }
}

# audio files
$files = Get-ChildItem -Path $assetsPath -Recurse -File | Where-Object { $audioExt -contains $_.Extension.ToLower() }
$total = $files.Count
$results = [System.Collections.Generic.List[PSCustomObject]]::new()
$timer = [System.Diagnostics.Stopwatch]::StartNew()

if ($total -eq 0) {
    Write-Progress -Activity "Creating music database" -Status "No audio files found" -Completed
} else {
    $workerScript = {
        param($FileData, $Root, $AudioExt, $LosslessExt, $ImgExt)

        Add-Type -AssemblyName System.Drawing -ErrorAction SilentlyContinue | Out-Null
        $shell = New-Object -ComObject Shell.Application
        $metadataColumnMap = $null
        $imageCache = @{}
        $ffprobeDataCache = @{}
        $bpmAnalysisCache = @{}
        $ffmpegAvailable = [bool](Get-Command ffmpeg -ErrorAction SilentlyContinue)

        function Get-Rel($p, $b) {
            if (!$p) { return "" }
            $path = $p.ToString()
            $rel = $path.Replace($b, "").TrimStart("\\")
            if (!$rel) { return "." }
            return $rel
        }

        function Normalize-DetailKey($value) {
            if ([string]::IsNullOrWhiteSpace($value)) {
                return ""
            }

            $formD = $value.Normalize([Text.NormalizationForm]::FormD)
            $builder = New-Object System.Text.StringBuilder
            foreach ($char in $formD.ToCharArray()) {
                $category = [Globalization.CharUnicodeInfo]::GetUnicodeCategory($char)
                if ($category -ne [Globalization.UnicodeCategory]::NonSpacingMark) {
                    [void]$builder.Append($char)
                }
            }

            $normalized = $builder.ToString().ToLowerInvariant()
            $normalized = $normalized -replace '[^a-z0-9]+', ' '
            $normalized = ($normalized -replace '\s+', ' ').Trim()
            return $normalized
        }

        function Get-MetadataColumnMap($folderObject) {
            $map = @{}
            for ($i = 0; $i -le 400; $i++) {
                $columnName = $folderObject.GetDetailsOf($null, $i)
                if ([string]::IsNullOrWhiteSpace($columnName)) {
                    continue
                }

                $key = Normalize-DetailKey $columnName
                if ($key -and -not $map.ContainsKey($key)) {
                    $map[$key] = $i
                }
            }
            return $map
        }

        function Get-DetailValue {
            param(
                $FolderObject,
                $Item,
                $ColumnMap,
                [string[]]$ColumnCandidates,
                [int[]]$FallbackIndices = @()
            )

            foreach ($candidate in $ColumnCandidates) {
                $key = Normalize-DetailKey $candidate
                if ($key -and $ColumnMap.ContainsKey($key)) {
                    $index = [int]$ColumnMap[$key]
                    $value = [string]$FolderObject.GetDetailsOf($Item, $index)
                    if (-not [string]::IsNullOrWhiteSpace($value)) {
                        return $value.Trim()
                    }
                }
            }

            foreach ($index in $FallbackIndices) {
                $value = [string]$FolderObject.GetDetailsOf($Item, $index)
                if (-not [string]::IsNullOrWhiteSpace($value)) {
                    return $value.Trim()
                }
            }

            return ""
        }

        function Get-UniqueNormalizedValues {
            param([string[]]$Values)

            $seen = @{}
            $result = @()

            foreach ($value in $Values) {
                if ([string]::IsNullOrWhiteSpace($value)) {
                    continue
                }

                $trimmed = $value.Trim()
                $key = $trimmed.ToLowerInvariant()
                if (-not $seen.ContainsKey($key)) {
                    $seen[$key] = $true
                    $result += $trimmed
                }
            }

            return $result
        }

        function Format-DurationFromSeconds {
            param([string]$SecondsText)

            if ([string]::IsNullOrWhiteSpace($SecondsText)) {
                return ""
            }

            $seconds = 0.0
            if (-not [double]::TryParse($SecondsText, [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$seconds)) {
                return ""
            }

            if ($seconds -lt 0) {
                return ""
            }

            $ts = [TimeSpan]::FromSeconds([Math]::Round($seconds))
            return "{0:00}:{1:00}:{2:00}" -f [int]$ts.TotalHours, $ts.Minutes, $ts.Seconds
        }

        function Get-FFprobeData {
            param([string]$FilePath)

            if ($ffprobeDataCache.ContainsKey($FilePath)) {
                return $ffprobeDataCache[$FilePath]
            }

            $data = [pscustomobject]@{
                Tags = @{}
                Audio = [pscustomobject]@{
                    duration_display = ""
                    bitrate_kbps = ""
                    sample_rate_hz = ""
                    channels = ""
                    codec = ""
                }
            }

            $ffprobeAvailable = [bool](Get-Command ffprobe -ErrorAction SilentlyContinue)
            if (-not $ffprobeAvailable) {
                $ffprobeDataCache[$FilePath] = $data
                return $data
            }

            try {
                $json = & ffprobe -v quiet -print_format json -show_format -show_streams -- "$FilePath" 2>$null
                if ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace($json)) {
                    $probe = $json | ConvertFrom-Json

                    $audioStream = $null
                    if ($probe.streams) {
                        $audioStream = @($probe.streams | Where-Object { $_.codec_type -eq 'audio' }) | Select-Object -First 1
                    }

                    $durationRaw = ""
                    if ($audioStream -and $audioStream.duration) { $durationRaw = [string]$audioStream.duration }
                    if (-not $durationRaw -and $probe.format -and $probe.format.duration) { $durationRaw = [string]$probe.format.duration }

                    $bitrateRaw = ""
                    if ($audioStream -and $audioStream.bit_rate) { $bitrateRaw = [string]$audioStream.bit_rate }
                    if (-not $bitrateRaw -and $probe.format -and $probe.format.bit_rate) { $bitrateRaw = [string]$probe.format.bit_rate }

                    $bitrateLabel = ""
                    if ($bitrateRaw) {
                        $bitrateParsed = 0.0
                        if ([double]::TryParse($bitrateRaw, [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$bitrateParsed) -and $bitrateParsed -gt 0) {
                            $bitrateLabel = ([int][Math]::Round($bitrateParsed / 1000.0)).ToString() + " Kbits/s"
                        }
                    }

                    $sampleRateHz = ""
                    if ($audioStream -and $audioStream.sample_rate) {
                        $sampleRateHz = [string]$audioStream.sample_rate
                    }

                    $channelsValue = ""
                    if ($audioStream -and $audioStream.channels) {
                        $channelsValue = [string]$audioStream.channels
                    }

                    $codecName = ""
                    if ($audioStream -and $audioStream.codec_name) {
                        $codecName = ([string]$audioStream.codec_name).ToUpperInvariant()
                    }

                    $data.Audio = [pscustomobject]@{
                        duration_display = Format-DurationFromSeconds $durationRaw
                        bitrate_kbps = $bitrateLabel
                        sample_rate_hz = $sampleRateHz
                        channels = $channelsValue
                        codec = $codecName
                    }

                    if ($probe.format -and $probe.format.tags) {
                        foreach ($property in $probe.format.tags.PSObject.Properties) {
                            $key = Normalize-DetailKey $property.Name
                            $value = [string]$property.Value
                            if ($key -and -not [string]::IsNullOrWhiteSpace($value) -and -not $data.Tags.ContainsKey($key)) {
                                $data.Tags[$key] = $value.Trim()
                            }
                        }
                    }

                    if ($probe.streams) {
                        foreach ($stream in $probe.streams) {
                            if (-not $stream.tags) { continue }
                            foreach ($property in $stream.tags.PSObject.Properties) {
                                $key = Normalize-DetailKey $property.Name
                                $value = [string]$property.Value
                                if ($key -and -not [string]::IsNullOrWhiteSpace($value) -and -not $data.Tags.ContainsKey($key)) {
                                    $data.Tags[$key] = $value.Trim()
                                }
                            }
                        }
                    }
                }
            } catch {
                # Keep default ffprobe data when parsing fails for this file.
            }

            $ffprobeDataCache[$FilePath] = $data
            return $data
        }

        function Get-TagValue {
            param(
                $TagMap,
                [string[]]$TagCandidates
            )

            foreach ($candidate in $TagCandidates) {
                $key = Normalize-DetailKey $candidate
                if ($key -and $TagMap.ContainsKey($key)) {
                    $value = [string]$TagMap[$key]
                    if (-not [string]::IsNullOrWhiteSpace($value)) {
                        return $value.Trim()
                    }
                }
            }

            return ""
        }

        function Get-BpmFromTagMap {
            param($TagMap)

            if (-not $TagMap) {
                return ""
            }

            $directTagValue = Get-TagValue -TagMap $TagMap -TagCandidates @(
                'bpm', 'tbpm', 'tempo', 'tmpo', 'beats_per_minute', 'beats-per-minute',
                'bpm_start', 'bpm_end', 'bpm_average', 'mix_bpm', 'musicbpm'
            )
            $directBpm = Get-NormalizedBpmValue -Value $directTagValue
            if ($directBpm) {
                return $directBpm
            }

            foreach ($entry in $TagMap.GetEnumerator()) {
                $tagKey = Normalize-DetailKey $entry.Key
                if ([string]::IsNullOrWhiteSpace($tagKey)) {
                    continue
                }

                if ($tagKey -match '(?i)\b(bpm|tbpm|tempo|tmpo|beats per minute|beatsperminute)\b') {
                    $candidate = Get-NormalizedBpmValue -Value ([string]$entry.Value)
                    if ($candidate) {
                        return $candidate
                    }
                }
            }

            return ""
        }

        function Get-NormalizedBpmValue {
            param([string]$Value)

            if ([string]::IsNullOrWhiteSpace($Value)) {
                return ""
            }

            $text = $Value.Trim()

            if ($text -match '(?i)(\d{2,3}(?:[\.,]\d+)?)(?:\s*bpm)?') {
                $raw = $matches[1] -replace ',', '.'
                $parsed = 0.0
                if ([double]::TryParse($raw, [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$parsed)) {
                    if ($parsed -ge 30 -and $parsed -le 300) {
                        if ($parsed -eq [math]::Floor($parsed)) {
                            return [string][int]$parsed
                        }
                        return [string][math]::Round($parsed, 1)
                    }
                }
            }

            return ""
        }

        function Get-AnalyzedBpm {
            param([string]$FilePath)

            if ([string]::IsNullOrWhiteSpace($FilePath)) {
                return ""
            }

            if ($bpmAnalysisCache.ContainsKey($FilePath)) {
                return [string]$bpmAnalysisCache[$FilePath]
            }

            $detectedBpm = ""

            # Try librosa Python library first (most reliable when available)
            $librosaScript = Join-Path $PSScriptRoot "scripts\bpm-detect-librosa.py"
            if (Test-Path $librosaScript) {
                try {
                    $pythonCmd = Get-Command python3 -ErrorAction SilentlyContinue
                    if (-not $pythonCmd) {
                        $pythonCmd = Get-Command python -ErrorAction SilentlyContinue
                    }
                    
                    if ($pythonCmd) {
                        $result = & $pythonCmd.Source "$librosaScript" "$FilePath" 2>$null
                        if ($result -and $result -match '^\d+(?:[\.,]\d+)?$') {
                            $raw = ($result.Trim()) -replace ',', '.'
                            $parsed = 0.0
                            if ([double]::TryParse($raw, [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$parsed)) {
                                if ($parsed -ge 30 -and $parsed -le 300) {
                                    $detectedBpm = ([int][math]::Round($parsed)).ToString()
                                    $bpmAnalysisCache[$FilePath] = $detectedBpm
                                    return $detectedBpm
                                }
                            }
                        }
                    }
                } catch {
                    # librosa attempt failed, continue to next method
                }
            }

            # Fallback: Try ffmpeg bpm filter (requires aubio/librosa integration in ffmpeg)
            if (-not $detectedBpm -and $ffmpegAvailable) {
                try {
                    $analysisOutput = & ffmpeg -hide_banner -nostats -t 180 -i "$FilePath" -vn -af "bpm" -f null NUL 2>&1
                    
                    if ($analysisOutput) {
                        foreach ($line in $analysisOutput) {
                            if ($line -match '(?i)\bbpm\b[^0-9]*([0-9]+(?:[\.,][0-9]+)?)') {
                                $raw = $matches[1] -replace ',', '.'
                                $parsed = 0.0
                                if ([double]::TryParse($raw, [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$parsed)) {
                                    if ($parsed -gt 0 -and $parsed -lt 300) {
                                        $detectedBpm = ([int][math]::Round($parsed)).ToString()
                                    }
                                }
                            }
                        }
                    }
                } catch {
                    # ffmpeg bpm filter likely not available; this is expected on most systems
                    $detectedBpm = ""
                }
            }

            $bpmAnalysisCache[$FilePath] = $detectedBpm
            return $detectedBpm
        }

        function Get-BpmFromM4aAtom {
            param([string]$FilePath)

            if ([string]::IsNullOrWhiteSpace($FilePath)) { return "" }
            $ext = [System.IO.Path]::GetExtension($FilePath).ToLower()
            if ($ext -ne '.m4a' -and $ext -ne '.mp4' -and $ext -ne '.aac') { return "" }

            try {
                $stream = [System.IO.File]::OpenRead($FilePath)
                $readLen = [Math]::Min(131072, $stream.Length)
                $bytes = New-Object byte[] $readLen
                $null = $stream.Read($bytes, 0, $readLen)
                $stream.Close()

                for ($i = 0; $i -lt $readLen - 22; $i++) {
                    if ($bytes[$i] -eq 0x74 -and $bytes[$i+1] -eq 0x6D -and $bytes[$i+2] -eq 0x70 -and $bytes[$i+3] -eq 0x6F) {
                        $bpmValue = ([int]$bytes[$i+20] -shl 8) -bor [int]$bytes[$i+21]
                        if ($bpmValue -ge 30 -and $bpmValue -le 300) {
                            return [string]$bpmValue
                        }
                    }
                }
            } catch {}

            return ""
        }

        function Get-BpmFromText {
            param([string]$Text)

            if ([string]::IsNullOrWhiteSpace($Text)) {
                return ""
            }

            if ($Text -match '(?i)\b(\d{2,3}(?:[\.,]\d+)?)\s*bpm\b') {
                $raw = $matches[1] -replace ',', '.'
                $parsed = 0.0
                if ([double]::TryParse($raw, [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$parsed)) {
                    if ($parsed -ge 30 -and $parsed -le 300) {
                        return [string][int][math]::Round($parsed)
                    }
                }
            }

            if ($Text -match '(?i)\bbpm\s*(\d{2,3}(?:[\.,]\d+)?)\b') {
                $raw = $matches[1] -replace ',', '.'
                $parsed = 0.0
                if ([double]::TryParse($raw, [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$parsed)) {
                    if ($parsed -ge 30 -and $parsed -le 300) {
                        return [string][int][math]::Round($parsed)
                    }
                }
            }

            return ""
        }

        function Get-NormalizedYearValue {
            param([string]$Value)

            if ([string]::IsNullOrWhiteSpace($Value)) {
                return ""
            }

            $text = $Value.Trim()
            if ($text -match '\b(19|20)\d{2}\b') {
                return $matches[0]
            }

            return $text
        }

        function Split-NumberAndTotal {
            param([string]$Value)

            $result = [pscustomobject]@{
                number = ""
                total = ""
            }

            if ([string]::IsNullOrWhiteSpace($Value)) {
                return $result
            }

            $text = $Value.Trim()
            if ($text -match '^\s*(\d+)\s*[\/\\]\s*(\d+)\s*$') {
                $result.number = $matches[1]
                $result.total = $matches[2]
                return $result
            }

            if ($text -match '^\s*(\d+)\s*$') {
                $result.number = $matches[1]
                return $result
            }

            return $result
        }

        function Get-NormalizedArtists($rawValue) {
            $rawText = [string]$rawValue
            if ([string]::IsNullOrWhiteSpace($rawText)) {
                return @()
            }

            $tokens = $rawText -split '\s*(?:;|\||\\\\|/|,|\bfeat\.?\b|\bfeaturing\b|\bft\.?\b)\s*'
            $artists = @(
                $tokens |
                    ForEach-Object { $_.Trim() } |
                    Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
                    Select-Object -Unique
            )

            return $artists
        }

        function Get-TagListValue {
            param(
                $TagMap,
                [string[]]$TagCandidates
            )

            $raw = Get-TagValue -TagMap $TagMap -TagCandidates $TagCandidates
            if ([string]::IsNullOrWhiteSpace($raw)) {
                return @()
            }

            $parts = $raw -split '\s*(?:;|,|\|)\s*'
            return @($parts | ForEach-Object { $_.Trim() } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -Unique)
        }

        function Get-ImageDetails($imgPath) {
            if ($imageCache.ContainsKey($imgPath)) {
                return $imageCache[$imgPath]
            }

            $fileInfo = Get-Item -LiteralPath $imgPath
            $width = 0; $height = 0; $ratio = "Unknown"
            $hexColor = "#000000"
            $averageColor = "#000000"
            $vibrantColor = "#000000"
            $mutedColor = "#000000"
            $colorPalette = @()

            $toHex = {
                param([int]$r, [int]$g, [int]$b)
                return "#{0:X2}{1:X2}{2:X2}" -f $r, $g, $b
            }
            
            try {
                $bmp = New-Object System.Drawing.Bitmap($imgPath)
                $width = $bmp.Width
                $height = $bmp.Height
                
                if ($width -eq $height) { $ratio = "Square" }
                elseif ($width -gt $height) { $ratio = "Landscape" }
                else { $ratio = "Portrait" }
                
                $sampleWidth = [Math]::Max(8, [Math]::Min(64, $width))
                $sampleHeight = [Math]::Max(8, [Math]::Min(64, $height))
                $sample = New-Object System.Drawing.Bitmap($bmp, $sampleWidth, $sampleHeight)

                $sumR = 0.0
                $sumG = 0.0
                $sumB = 0.0
                $sampleCount = 0
                $colorCounts = @{}

                for ($y = 0; $y -lt $sampleHeight; $y += 2) {
                    for ($x = 0; $x -lt $sampleWidth; $x += 2) {
                        $pixel = $sample.GetPixel($x, $y)
                        if ($pixel.A -lt 16) { continue }

                        $sumR += $pixel.R
                        $sumG += $pixel.G
                        $sumB += $pixel.B
                        $sampleCount++

                        $qR = [Math]::Min(255, [Math]::Round($pixel.R / 32) * 32)
                        $qG = [Math]::Min(255, [Math]::Round($pixel.G / 32) * 32)
                        $qB = [Math]::Min(255, [Math]::Round($pixel.B / 32) * 32)
                        $colorKey = "{0:D3}-{1:D3}-{2:D3}" -f $qR, $qG, $qB

                        if ($colorCounts.ContainsKey($colorKey)) {
                            $colorCounts[$colorKey]++
                        } else {
                            $colorCounts[$colorKey] = 1
                        }
                    }
                }

                if ($sampleCount -gt 0) {
                    $avgR = [int][Math]::Round($sumR / $sampleCount)
                    $avgG = [int][Math]::Round($sumG / $sampleCount)
                    $avgB = [int][Math]::Round($sumB / $sampleCount)
                    $averageColor = & $toHex $avgR $avgG $avgB

                    $sortedColors = $colorCounts.GetEnumerator() | Sort-Object Value -Descending
                    $topColors = @($sortedColors | Select-Object -First 8)

                    if ($topColors.Count -gt 0) {
                        $dominantParts = $topColors[0].Name -split '-'
                        $hexColor = & $toHex ([int]$dominantParts[0]) ([int]$dominantParts[1]) ([int]$dominantParts[2])
                    }

                    $bestVibrantScore = -1.0
                    $bestMutedScore = -1.0

                    foreach ($entry in $topColors) {
                        $parts = $entry.Name -split '-'
                        $r = [int]$parts[0]
                        $g = [int]$parts[1]
                        $b = [int]$parts[2]
                        $countWeight = [double]$entry.Value

                        $colorPalette += (& $toHex $r $g $b)

                        $maxChannel = [Math]::Max($r, [Math]::Max($g, $b))
                        $minChannel = [Math]::Min($r, [Math]::Min($g, $b))
                        $spread = $maxChannel - $minChannel
                        $brightness = $maxChannel / 255.0
                        $saturation = if ($maxChannel -eq 0) { 0.0 } else { $spread / [double]$maxChannel }

                        $vibrantScore = ($saturation * 0.75 + $brightness * 0.25) * [Math]::Log10($countWeight + 1)
                        $mutedBalance = 1.0 - [Math]::Abs($brightness - 0.55)
                        $mutedScore = ((1.0 - $saturation) * 0.7 + $mutedBalance * 0.3) * [Math]::Log10($countWeight + 1)

                        if ($vibrantScore -gt $bestVibrantScore) {
                            $bestVibrantScore = $vibrantScore
                            $vibrantColor = & $toHex $r $g $b
                        }

                        if ($mutedScore -gt $bestMutedScore) {
                            $bestMutedScore = $mutedScore
                            $mutedColor = & $toHex $r $g $b
                        }
                    }

                    $colorPalette = @($colorPalette | Select-Object -Unique)
                }

                $sample.Dispose()
                $bmp.Dispose()
            } catch {
                # Keep default metadata when image analysis fails.
            }

            $result = [ordered]@{
                name = $fileInfo.Name
                type = $fileInfo.Extension.Replace('.','').ToUpper()
                path = Get-Rel $imgPath $Root
                size_bytes = $fileInfo.Length
                dimensions = "$width x $height"
                aspect_ratio = $ratio
                dominant_color = $hexColor
                average_color = $averageColor
                vibrant_color = $vibrantColor
                muted_color = $mutedColor
                color_palette = @($colorPalette)
            }

            $imageCache[$imgPath] = $result
            return $result
        }

        $f = Get-Item -LiteralPath $FileData.FullName
        $fObj = $shell.NameSpace($f.DirectoryName)
        $item = $fObj.ParseName($f.Name)

        $relDir = Get-Rel $f.DirectoryName $Root
        $parts = $relDir -split '\\'

        if ($parts.Count -gt 0 -and $parts[0] -ieq 'assets') {
            $parts = $parts[1..($parts.Count-1)]
        }

        $isSingle = $false
        $group = $null
        $album = $null
        $trackFolder = $null

        if ($parts.Count -gt 0) {
            if ($parts[0] -match "(?i)^Single$") {
                $isSingle = $true
                $group = "Single"
                if ($parts.Count -ge 2) { $trackFolder = $parts[1] }
            } else {
                if ($parts.Count -eq 1) {
                    $group = $parts[0]
                } elseif ($parts.Count -eq 2) {
                    $group = $parts[0]
                    $trackFolder = $parts[1]
                } else {
                    $group = $parts[0]
                    $album = $parts[1]
                    $trackFolder = $parts[2]
                }
            }
        }

        $trackVersionsCount = (Get-ChildItem -Path $f.DirectoryName -File | Where-Object { $AudioExt -contains $_.Extension.ToLower() }).Count
        $fileHash = (Get-FileHash -Path $f.FullName -Algorithm SHA256).Hash

        $trackArtworks = @()
        $albumArtworks = @()

        $trackArtworksRaw = Get-ChildItem -Path $f.DirectoryName -File | Where-Object { $ImgExt -contains $_.Extension.ToLower() }
        $trackArtworksRaw | Sort-Object {
            if ($_.BaseName -ieq "artwork") { 0 }
            elseif ($_.BaseName -ieq "folder") { 1 }
            elseif ($_.BaseName -ieq "albumartsmall") { 2 }
            else { 3 }
        } | ForEach-Object {
            $trackArtworks += Get-ImageDetails $_.FullName
        }

        if ($f.Directory.Parent -and $f.Directory.Parent.FullName -ne $Root) {
            $albumArtworksRaw = Get-ChildItem -Path $f.Directory.Parent.FullName -File | Where-Object { $ImgExt -contains $_.Extension.ToLower() }
            $albumArtworksRaw | Sort-Object {
                if ($_.BaseName -ieq "artwork") { 0 }
                elseif ($_.BaseName -ieq "folder") { 1 }
                elseif ($_.BaseName -ieq "albumartsmall") { 2 }
                else { 3 }
            } | ForEach-Object {
                $albumArtworks += Get-ImageDetails $_.FullName
            }
        }

        if (-not $metadataColumnMap) {
            $metadataColumnMap = Get-MetadataColumnMap $fObj
        }

        $ffProbeData = Get-FFprobeData -FilePath $f.FullName
        $ffTags = $ffProbeData.Tags
        $ffAudio = $ffProbeData.Audio

        $rawArt = Get-DetailValue -FolderObject $fObj -Item $item -ColumnMap $metadataColumnMap -ColumnCandidates @(
            'Contributing artists', 'Artist', 'Artists', 'Participating artists', 'Album artists',
            'Artiste', 'Artistes', 'Artistes participants', 'Interpretes'
        ) -FallbackIndices @(13)
        $ffArtist = Get-TagValue -TagMap $ffTags -TagCandidates @('artist', 'artists', 'performer', 'album_artist')
        $artists = Get-UniqueNormalizedValues @(
            (Get-NormalizedArtists $ffArtist)
            (Get-NormalizedArtists $rawArt)
        )

        $metaTitleShell = Get-DetailValue -FolderObject $fObj -Item $item -ColumnMap $metadataColumnMap -ColumnCandidates @('Title', 'Titre') -FallbackIndices @(21)
        $metaTitleFf = Get-TagValue -TagMap $ffTags -TagCandidates @('title')
        $metaTitle = if ($metaTitleShell) { $metaTitleShell } elseif ($metaTitleFf) { $metaTitleFf } else { $f.BaseName }

        $metaAlbumShell = Get-DetailValue -FolderObject $fObj -Item $item -ColumnMap $metadataColumnMap -ColumnCandidates @('Album') -FallbackIndices @(14)
        $metaAlbumFf = Get-TagValue -TagMap $ffTags -TagCandidates @('album')
        $metaAlbum = if ($metaAlbumShell) { $metaAlbumShell } elseif ($metaAlbumFf) { $metaAlbumFf } else { $album }

        $metaAlbumArtist = Get-DetailValue -FolderObject $fObj -Item $item -ColumnMap $metadataColumnMap -ColumnCandidates @('Album artist', 'Album artists', 'Artiste de l album')
        $metaAlbumArtistFf = Get-TagValue -TagMap $ffTags -TagCandidates @('album_artist', 'albumartist')
        if (-not $metaAlbumArtist) {
            $metaAlbumArtist = $metaAlbumArtistFf
        }

        $metaComposerShell = Get-DetailValue -FolderObject $fObj -Item $item -ColumnMap $metadataColumnMap -ColumnCandidates @('Composer', 'Compositeur') -FallbackIndices @(223, 243)
        $metaComposerFf = Get-TagValue -TagMap $ffTags -TagCandidates @('composer')
        $metaComposer = if ($metaComposerShell) { $metaComposerShell } elseif ($metaComposerFf) { $metaComposerFf } else { "" }

        $metaGenreShell = Get-DetailValue -FolderObject $fObj -Item $item -ColumnMap $metadataColumnMap -ColumnCandidates @('Genre') -FallbackIndices @(16)
        $metaGenreFf = Get-TagValue -TagMap $ffTags -TagCandidates @('genre')
        $metaGenre = if ($metaGenreShell) { $metaGenreShell } elseif ($metaGenreFf) { $metaGenreFf } else { "" }

        $metaYearShell = Get-DetailValue -FolderObject $fObj -Item $item -ColumnMap $metadataColumnMap -ColumnCandidates @('Year', 'Annee', 'Date') -FallbackIndices @(15)
        $metaYearFf = Get-TagValue -TagMap $ffTags -TagCandidates @('date', 'year')
        $metaYearRaw = if ($metaYearShell) { $metaYearShell } elseif ($metaYearFf) { $metaYearFf } else { "" }
        $metaYear = Get-NormalizedYearValue -Value $metaYearRaw

        $metaTrackNumberShell = Get-DetailValue -FolderObject $fObj -Item $item -ColumnMap $metadataColumnMap -ColumnCandidates @('Track number', 'Numero de piste', '#') -FallbackIndices @(26)
        $metaTrackNumberFf = Get-TagValue -TagMap $ffTags -TagCandidates @('track', 'tracknumber')
        $metaTrackNumberRaw = if ($metaTrackNumberShell) { $metaTrackNumberShell } elseif ($metaTrackNumberFf) { $metaTrackNumberFf } else { "" }
        $trackPair = Split-NumberAndTotal -Value $metaTrackNumberRaw
        $metaTrackNumber = $trackPair.number

        $metaTotalTracks = Get-DetailValue -FolderObject $fObj -Item $item -ColumnMap $metadataColumnMap -ColumnCandidates @('Track count', 'Total tracks', 'Nombre total de pistes')
        if (-not $metaTotalTracks) {
            $metaTotalTracks = Get-TagValue -TagMap $ffTags -TagCandidates @('tracktotal', 'totaltracks')
        }
        if (-not $metaTotalTracks -and $trackPair.total) {
            $metaTotalTracks = $trackPair.total
        }
        if (-not $metaTotalTracks -and -not $isSingle -and $album) {
            $albumDir = $f.Directory.Parent
            if ($albumDir -and (Test-Path $albumDir.FullName)) {
                $metaTotalTracks = @(Get-ChildItem -Path $albumDir.FullName -Directory).Count
            }
        }

        $metaDiscNumber = Get-DetailValue -FolderObject $fObj -Item $item -ColumnMap $metadataColumnMap -ColumnCandidates @('Disc number', 'Numero de disque')
        if (-not $metaDiscNumber) {
            $metaDiscNumber = Get-TagValue -TagMap $ffTags -TagCandidates @('disc', 'discnumber')
        }
        $discPair = Split-NumberAndTotal -Value $metaDiscNumber
        $metaDiscNumber = $discPair.number

        $metaTotalDiscs = Get-DetailValue -FolderObject $fObj -Item $item -ColumnMap $metadataColumnMap -ColumnCandidates @('Total discs', 'Nombre total de disques')
        if (-not $metaTotalDiscs) {
            $metaTotalDiscs = Get-TagValue -TagMap $ffTags -TagCandidates @('disctotal', 'totaldiscs')
        }
        if (-not $metaTotalDiscs -and $discPair.total) {
            $metaTotalDiscs = $discPair.total
        }

        $metaLyrics = Get-DetailValue -FolderObject $fObj -Item $item -ColumnMap $metadataColumnMap -ColumnCandidates @('Lyrics', 'Paroles')
        if (-not $metaLyrics) {
            $metaLyrics = Get-TagValue -TagMap $ffTags -TagCandidates @('lyrics', 'unsyncedlyrics')
        }

        $metaBpmTag = Get-BpmFromTagMap -TagMap $ffTags
        $metaBpmShell = Get-NormalizedBpmValue -Value (Get-DetailValue -FolderObject $fObj -Item $item -ColumnMap $metadataColumnMap -ColumnCandidates @('Beats-per-minute', 'Beats per minute', 'BPM') -FallbackIndices @(312))
        
        # Priority order for BPM extraction:
        # 1. Embedded audio tags (most reliable, already set in file by encoder)
        # 2. Shell metadata (sometimes available, but can be unreliable or unrelated numbers)
        # 3. Audio analysis (requires ffmpeg bpm filter, often not available)
        # 4. Filename heuristics (least reliable, but better than nothing)
        
        $metaBpm = ""
        $metaBpmSource = ""
        
        # First priority: embedded tags (ID3, vorbis, mp4 tags, etc.)
        if ($metaBpmTag) {
            $metaBpm = $metaBpmTag
            $metaBpmSource = "tag"
        }
        # Second priority: M4A tmpo atom (ffprobe doesn't expose this tag)
        if (-not $metaBpm) {
            $metaBpmAtom = Get-BpmFromM4aAtom -FilePath $f.FullName
            if ($metaBpmAtom) {
                $metaBpm = $metaBpmAtom
                $metaBpmSource = "tag"
            }
        }
        # Third priority: shell metadata (validated to ensure it's actually a BPM value)
        if (-not $metaBpm -and $metaBpmShell) {
            $metaBpm = $metaBpmShell
            $metaBpmSource = "shell"
        }
        # Third priority: audio analysis (may not work if ffmpeg lacks bpm filter)
        elseif (-not $metaBpm) {
            $analyzedbpm = Get-AnalyzedBpm -FilePath $f.FullName
            if ($analyzedbpm) {
                $metaBpm = $analyzedbpm
                $metaBpmSource = "analysis"
            }
        }
        # Fourth priority: heuristics from filename (very unreliable)
        if (-not $metaBpm) {
            $heuristicbpm = Get-BpmFromText -Text $metaTitle
            if (-not $heuristicbpm) {
                $heuristicbpm = Get-BpmFromText -Text $f.BaseName
            }
            if ($heuristicbpm) {
                $metaBpm = $heuristicbpm
                $metaBpmSource = "heuristic"
            }
        }

        $metaComment = Get-DetailValue -FolderObject $fObj -Item $item -ColumnMap $metadataColumnMap -ColumnCandidates @('Comments', 'Comment', 'Commentaires') -FallbackIndices @(24)
        if (-not $metaComment) {
            $metaComment = Get-TagValue -TagMap $ffTags -TagCandidates @('comment', 'description')
        }

        $metaDescription = Get-DetailValue -FolderObject $fObj -Item $item -ColumnMap $metadataColumnMap -ColumnCandidates @('Description') -FallbackIndices @(219)
        if (-not $metaDescription) {
            $metaDescription = Get-TagValue -TagMap $ffTags -TagCandidates @('description')
        }

        $metaProducerShell = Get-DetailValue -FolderObject $fObj -Item $item -ColumnMap $metadataColumnMap -ColumnCandidates @('Producer', 'Producteur')
        $metaProducerTag = Get-TagValue -TagMap $ffTags -TagCandidates @('producer', 'produced by')
        $metaProducer = if ($metaProducerShell) { $metaProducerShell } else { $metaProducerTag }

        $metaLabelShell = Get-DetailValue -FolderObject $fObj -Item $item -ColumnMap $metadataColumnMap -ColumnCandidates @('Label', 'Maison de disques')
        $metaLabelTag = Get-TagValue -TagMap $ffTags -TagCandidates @('label', 'record label')
        $metaLabel = if ($metaLabelShell) { $metaLabelShell } else { $metaLabelTag }

        $metaPublisherShell = Get-DetailValue -FolderObject $fObj -Item $item -ColumnMap $metadataColumnMap -ColumnCandidates @('Publisher', 'Editeur')
        $metaPublisherTag = Get-TagValue -TagMap $ffTags -TagCandidates @('publisher')
        $metaPublisher = if ($metaPublisherShell) { $metaPublisherShell } else { $metaPublisherTag }

        $metaIsrcShell = Get-DetailValue -FolderObject $fObj -Item $item -ColumnMap $metadataColumnMap -ColumnCandidates @('ISRC')
        $metaIsrcTag = Get-TagValue -TagMap $ffTags -TagCandidates @('isrc')
        $metaIsrc = if ($metaIsrcShell) { $metaIsrcShell } else { $metaIsrcTag }

        $metaUpcShell = Get-DetailValue -FolderObject $fObj -Item $item -ColumnMap $metadataColumnMap -ColumnCandidates @('UPC', 'Barcode')
        $metaUpcTag = Get-TagValue -TagMap $ffTags -TagCandidates @('upc', 'barcode')
        $metaUpc = if ($metaUpcShell) { $metaUpcShell } else { $metaUpcTag }

        $metaMoodShell = Get-DetailValue -FolderObject $fObj -Item $item -ColumnMap $metadataColumnMap -ColumnCandidates @('Mood', 'Ambiance')
        $metaMoodTag = Get-TagValue -TagMap $ffTags -TagCandidates @('mood')
        $metaMood = if ($metaMoodShell) { $metaMoodShell } else { $metaMoodTag }

        $metaLanguageShell = Get-DetailValue -FolderObject $fObj -Item $item -ColumnMap $metadataColumnMap -ColumnCandidates @('Language', 'Langue')
        $metaLanguageTag = Get-TagValue -TagMap $ffTags -TagCandidates @('language', 'lang')
        $metaLanguage = if ($metaLanguageShell) { $metaLanguageShell } else { $metaLanguageTag }

        $metaCategoryShell = Get-DetailValue -FolderObject $fObj -Item $item -ColumnMap $metadataColumnMap -ColumnCandidates @('Category', 'Categorie', 'Content group')
        $metaCategoryTag = Get-TagValue -TagMap $ffTags -TagCandidates @('category', 'content group', 'grouping')
        $metaCategory = if ($metaCategoryShell) { $metaCategoryShell } else { $metaCategoryTag }
        $metaRemixArtist = Get-TagValue -TagMap $ffTags -TagCandidates @('remixer', 'mixartist', 'remix artist')
        $metaEdition = Get-TagValue -TagMap $ffTags -TagCandidates @('edition', 'version', 'release type')
        $metaRecordingYear = Get-TagValue -TagMap $ffTags -TagCandidates @('originalyear', 'recording year', 'recorded date')
        if (-not $metaRecordingYear -and $metaYear) {
            $metaRecordingYear = $metaYear
        }
        $metaVideoLink = Get-TagValue -TagMap $ffTags -TagCandidates @('video', 'video url', 'music video')
        $metaStreamingLink = Get-TagValue -TagMap $ffTags -TagCandidates @('url', 'website', 'streaming', 'streaming url')
        $metaTags = Get-TagListValue -TagMap $ffTags -TagCandidates @('tags', 'keywords')

        if (-not $metaAlbumArtist) {
            $metaAlbumArtist = if ($rawArt) { $rawArt } else { $ffArtist }
        }

        if ($artists.Count -eq 0 -and $metaAlbumArtist) {
            $artists = Get-NormalizedArtists $metaAlbumArtist
        }

        if ($metaComposer) {
            $artists = Get-UniqueNormalizedValues @(
                $artists
                (Get-NormalizedArtists $metaComposer)
            )
        }

        $durationShell = Get-DetailValue -FolderObject $fObj -Item $item -ColumnMap $metadataColumnMap -ColumnCandidates @('Length', 'Duration', 'Duree') -FallbackIndices @(27)
        $bitrateShell = Get-DetailValue -FolderObject $fObj -Item $item -ColumnMap $metadataColumnMap -ColumnCandidates @('Bit rate', 'Bitrate', 'Debit binaire') -FallbackIndices @(28)
        $sampleRateShell = Get-DetailValue -FolderObject $fObj -Item $item -ColumnMap $metadataColumnMap -ColumnCandidates @('Sample rate', 'Frequence d echantillonnage') -FallbackIndices @(316)
        $channelsShell = Get-DetailValue -FolderObject $fObj -Item $item -ColumnMap $metadataColumnMap -ColumnCandidates @('Channels', 'Canaux') -FallbackIndices @(311)

        $metaDuration = if ($durationShell) { $durationShell } elseif ($ffAudio.duration_display) { $ffAudio.duration_display } else { "" }
        $metaBitrate = if ($bitrateShell) { $bitrateShell } elseif ($ffAudio.bitrate_kbps) { $ffAudio.bitrate_kbps } else { "" }
        $metaSampleRate = if ($sampleRateShell) { $sampleRateShell } elseif ($ffAudio.sample_rate_hz) { "$($ffAudio.sample_rate_hz) Hz" } else { "" }
        $metaChannels = if ($channelsShell) { $channelsShell } elseif ($ffAudio.channels) { $ffAudio.channels } else { "" }
        $metaCodec = if ($ffAudio.codec) { $ffAudio.codec } else { $f.Extension.Replace('.','').ToUpper() }

        $epochCreated = [int][double]::Parse((Get-Date $f.CreationTime -UFormat %s))
        $epochModified = [int][double]::Parse((Get-Date $f.LastWriteTime -UFormat %s))

        $indexedItem = [ordered]@{
            id = $FileData.Index + 1
            logic = [ordered]@{
                hash_sha256 = $fileHash
                track_name = if ($trackFolder) { $trackFolder } else { $f.BaseName }
                version_name = $f.BaseName
                total_versions_in_folder = $trackVersionsCount
                is_single = $isSingle
                hierarchy = [ordered]@{
                    group = $group
                    album = $album
                    folder = $trackFolder
                }
            }
            file = [ordered]@{
                name = $f.Name
                ext = $f.Extension.Replace('.','').ToUpper()
                path = Get-Rel $f.FullName $Root
                dir = $relDir
                size_bytes = $f.Length
                size_mb = [math]::Round($f.Length / 1MB, 2)
                created = $f.CreationTime.ToString("yyyy-MM-dd HH:mm:ss")
                modified = $f.LastWriteTime.ToString("yyyy-MM-dd HH:mm:ss")
                epoch_created = $epochCreated
                epoch_modified = $epochModified
            }
            metadata = [ordered]@{
                title = $metaTitle
                file_title = $f.BaseName
                file_name = $f.Name
                artists = @($artists)
                album_artist = $metaAlbumArtist
                composer = $metaComposer
                album = $metaAlbum
                genre = $metaGenre
                year = $metaYear
                track_number = $metaTrackNumber
                total_tracks = $metaTotalTracks
                disc_number = $metaDiscNumber
                total_discs = $metaTotalDiscs
                bpm = $metaBpm
                bpm_source = $metaBpmSource
                lyrics = $metaLyrics
                comment = $metaComment
                description = $metaDescription
                producer = $metaProducer
                label = $metaLabel
                publisher = $metaPublisher
                isrc = $metaIsrc
                upc = $metaUpc
                mood = $metaMood
                language = $metaLanguage
                category = $metaCategory
                tags = @($metaTags)
                remix_artist = $metaRemixArtist
                edition = $metaEdition
                recording_year = $metaRecordingYear
                video_link = $metaVideoLink
                streaming_link = $metaStreamingLink
            }
            audio_specs = [ordered]@{
                is_lossless = ($LosslessExt -contains $f.Extension.ToLower())
                duration = $metaDuration
                codec = $metaCodec
                bitrate = $metaBitrate
                sample_rate = $metaSampleRate
                channels = $metaChannels
            }
            artworks = [ordered]@{
                track_artwork = $trackArtworks
                album_artwork = $albumArtworks
            }
        }

        [pscustomobject]@{
            index = [int]$FileData.Index
            item = $indexedItem
            filename = $f.Name
        }
    }

    $maxThreads = [Math]::Min([Math]::Max([Environment]::ProcessorCount, 2), 12)
    Write-Host "Using $maxThreads parallel workers for indexing..." -ForegroundColor Cyan

    $fileWorkItems = for ($i = 0; $i -lt $total; $i++) {
        [pscustomobject]@{
            Index = $i
            FullName = $files[$i].FullName
        }
    }

    $runspacePool = [RunspaceFactory]::CreateRunspacePool(1, $maxThreads)
    $runspacePool.Open()

    $tasks = New-Object System.Collections.Generic.List[object]
    $indexedEntries = New-Object System.Collections.Generic.List[object]

    foreach ($workItem in $fileWorkItems) {
        $ps = [PowerShell]::Create()
        $ps.RunspacePool = $runspacePool
        $null = $ps.AddScript($workerScript).AddArgument($workItem).AddArgument($root).AddArgument($audioExt).AddArgument($losslessExt).AddArgument($imgExt)

        $handle = $ps.BeginInvoke()
        $tasks.Add([pscustomobject]@{
            PowerShell = $ps
            Handle = $handle
            Index = $workItem.Index
        })
    }

    $processed = 0

    try {
        while ($tasks.Count -gt 0) {
            for ($t = $tasks.Count - 1; $t -ge 0; $t--) {
                $task = $tasks[$t]
                if (-not $task.Handle.IsCompleted) {
                    continue
                }

                try {
                    $workerOutput = $task.PowerShell.EndInvoke($task.Handle)
                    if ($workerOutput) {
                        foreach ($outputItem in $workerOutput) {
                            $indexedEntries.Add($outputItem)
                        }
                    }
                } catch {
                    $filePath = $files[$task.Index].FullName
                    Write-Warning "Failed indexing file: $filePath"
                    Write-Warning $_.Exception.Message
                } finally {
                    $completedFileName = $files[$task.Index].Name
                    $task.PowerShell.Dispose()
                    $tasks.RemoveAt($t)
                    $processed++
                    $pct = ($processed / $total) * 100
                    Write-Progress -Activity "Creating music database" -Status "Analyzing [$processed/$total] : $completedFileName" -PercentComplete $pct
                }
            }

            if ($tasks.Count -gt 0) {
                Start-Sleep -Milliseconds 40
            }
        }
    } finally {
        Write-Progress -Activity "Creating music database" -Completed
        $runspacePool.Close()
        $runspacePool.Dispose()
    }

    $orderedIndexedEntries = $indexedEntries | Sort-Object { [int]$_.index }
    foreach ($entry in $orderedIndexedEntries) {
        $results.Add($entry.item)
    }
}

$timer.Stop()

# Creation of the root global object
$finalData = [ordered]@{
    info = [ordered]@{
        date = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
        total_tracks_versions = $total
        execution_time_ms = $timer.ElapsedMilliseconds
    }
    items = $results
}

# Convert to raw JSON (generates 4 spaces indentation by default)
$rawJsonLines = ($finalData | ConvertTo-Json -Depth 20) -split "`r?`n"

# JSON INDENTATION OPTIMIZATION TO 1 SPACE (ALGORITHM)
Write-Host "`nOptimizing JSON formatting (Strict 1 space indentation)..." -ForegroundColor Cyan
$optimizedJson = foreach ($line in $rawJsonLines) {
    if ($line -match '^(\s+)(.*)$') {
        # Recupere le nombre d'espaces actuels, le divise par 4 (standard PowerShell), ou met 1
        $currentSpaces = $matches[1].Length
        $newIndentLevel = [math]::Floor($currentSpaces / 4)
        if ($newIndentLevel -le 0) { $newIndentLevel = 1 }
        
        $newIndent = " " * $newIndentLevel
        $newIndent + $matches[2]
    } else {
        $line
    }
}

# Final save in clean UTF-8
[System.IO.File]::WriteAllLines($output, $optimizedJson, (New-Object System.Text.UTF8Encoding($false)))

Write-Host "`n[SUCCESS] Database $output generated successfully!" -ForegroundColor Green
Write-Host "$total versions indexed in $($timer.Elapsed.TotalSeconds) seconds." -ForegroundColor Green
