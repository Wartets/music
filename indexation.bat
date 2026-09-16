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

# Native acoustic BPM detector using multi-band onset flux and autocorrelation analysis
if (-not ([System.Management.Automation.PSTypeName]'AudioBpmDetector').Type) {
    Add-Type -TypeDefinition @"
    using System;
    using System.IO;

    public class AudioBpmDetector {
        public static int DetectBpmFromPcmFile(string filePath, int sampleRate) {
            if (!File.Exists(filePath)) return 0;
            try {
                byte[] pcmData = File.ReadAllBytes(filePath);
                return DetectBpmFromBytes(pcmData, sampleRate);
            } catch {
                return 0;
            }
        }

        private static float[] RunLowPass(float[] input, float cutoffHz, int sampleRate) {
            int n = input.Length;
            float[] output = new float[n];
            float rc = 1.0f / (2.0f * (float)Math.PI * cutoffHz);
            float dt = 1.0f / sampleRate;
            float alpha = dt / (rc + dt);

            float last = 0f;
            for (int i = 0; i < n; i++) {
                last += alpha * (input[i] - last);
                output[i] = last;
            }
            last = 0f;
            for (int i = n - 1; i >= 0; i--) {
                last += alpha * (output[i] - last);
                output[i] = last;
            }
            return output;
        }

        private static double SampleAcf(double[] acf, int totalLags, double lag) {
            if (lag < 1.0 || lag >= totalLags - 2) return 0.0;
            int i = (int)lag;
            double frac = lag - i;
            double y0 = (i > 0) ? acf[i - 1] : acf[i];
            double y1 = acf[i];
            double y2 = acf[i + 1];
            double y3 = (i + 2 < totalLags) ? acf[i + 2] : y2;
            double a = -0.5 * y0 + 1.5 * y1 - 1.5 * y2 + 0.5 * y3;
            double b = y0 - 2.5 * y1 + 2.0 * y2 - 0.5 * y3;
            double c = -0.5 * y0 + 0.5 * y2;
            double d = y1;
            return a * frac * frac * frac + b * frac * frac + c * frac + d;
        }

        private static double GetCombScore(double bpm, double[] acf, int totalLags, double frameRate) {
            double lagD = (frameRate * 60.0) / bpm;
            if (lagD < 2.0 || lagD >= totalLags - 2) return -1000.0;

            double c1 = SampleAcf(acf, totalLags, lagD);
            double c2 = SampleAcf(acf, totalLags, lagD * 2.0);
            double c3 = SampleAcf(acf, totalLags, lagD * 3.0);
            double c4 = SampleAcf(acf, totalLags, lagD * 4.0);

            double cSync1 = SampleAcf(acf, totalLags, lagD * 1.5);
            double cSync2 = SampleAcf(acf, totalLags, lagD * 0.75);

            double comb = (c1 * 1.0) + (c2 * 0.55) + (c3 * 0.30) + (c4 * 0.15)
                          - (cSync1 * 0.45) - (cSync2 * 0.25);

            double prior = Math.Exp(-0.5 * Math.Pow((bpm - 120.0) / 65.0, 2));
            return comb * (0.80 + 0.20 * prior);
        }

        private static double ResolveOctave(double bestBpm, double[] acf, int totalLags, double frameRate) {
            if (bestBpm <= 0) return 0;
            double lagD = (frameRate * 60.0) / bestBpm;
            double currentPeak = SampleAcf(acf, totalLags, lagD);

            // 1. Half-time check: is the true tempo double this value?
            double doubleBpm = bestBpm * 2.0;
            if (doubleBpm <= 195.0) {
                double lagHalf = lagD * 0.5;
                if (lagHalf >= 2.0 && lagHalf < totalLags - 2) {
                    double halfPeak = SampleAcf(acf, totalLags, lagHalf);
                    double left = SampleAcf(acf, totalLags, lagHalf - 1.2);
                    double right = SampleAcf(acf, totalLags, lagHalf + 1.2);
                    bool isPeak = (halfPeak > left && halfPeak > right);

                    double scoreCurrent = GetCombScore(bestBpm, acf, totalLags, frameRate);
                    double scoreDouble = GetCombScore(doubleBpm, acf, totalLags, frameRate);

                    if (isPeak && halfPeak > 0.0) {
                        if (bestBpm < 85.0 && scoreDouble >= scoreCurrent * 0.78) {
                            bestBpm = doubleBpm;
                            lagD = lagHalf;
                            currentPeak = halfPeak;
                        } else if (scoreDouble > scoreCurrent * 1.05) {
                            bestBpm = doubleBpm;
                            lagD = lagHalf;
                            currentPeak = halfPeak;
                        }
                    }
                }
            }

            // 2. Double-time check: is the true tempo half this value?
            double halfBpm = bestBpm / 2.0;
            if (bestBpm >= 130.0 && halfBpm >= 60.0) {
                double lagDouble = lagD * 2.0;
                if (lagDouble < totalLags - 2) {
                    double doublePeak = SampleAcf(acf, totalLags, lagDouble);
                    double scoreCurrent = GetCombScore(bestBpm, acf, totalLags, frameRate);
                    double scoreHalf = GetCombScore(halfBpm, acf, totalLags, frameRate);

                    double left = SampleAcf(acf, totalLags, lagD - 1.2);
                    double right = SampleAcf(acf, totalLags, lagD + 1.2);
                    double prominence = currentPeak - Math.Min(left, right);

                    if (prominence <= 0.015 || (scoreHalf > scoreCurrent * 1.10 && doublePeak > currentPeak * 1.15)) {
                        bestBpm = halfBpm;
                    } else if (bestBpm > 175.0 && scoreHalf >= scoreCurrent * 0.85) {
                        bestBpm = halfBpm;
                    }
                }
            }

            return bestBpm;
        }

        public static int DetectBpmFromBytes(byte[] pcmData, int sampleRate) {
            if (pcmData == null || pcmData.Length < sampleRate * 8) return 0;

            int bytesPerSample = 2;
            int totalSamples = pcmData.Length / bytesPerSample;
            if (totalSamples < sampleRate * 8) return 0;

            float[] x = new float[totalSamples];
            for (int i = 0; i < totalSamples; i++) {
                int offset = i * bytesPerSample;
                short s16 = (short)(pcmData[offset] | (pcmData[offset + 1] << 8));
                x[i] = s16 / 32768.0f;
            }

            // 1. Multi-band Crossover Filterbank (4 sub-bands for rich rhythmic resolution):
            // Band 0: Sub & Kick (0 - 200 Hz)
            // Band 1: Low-Mid / Snare body & Bass (200 - 900 Hz)
            // Band 2: Mid-High / Melodic onsets & Vocals (900 - 3500 Hz)
            // Band 3: Highs / Hi-hats & Cymbals (3500 Hz+)
            float[] lp200 = RunLowPass(x, 200f, sampleRate);
            float[] lp900 = RunLowPass(x, 900f, sampleRate);
            float[] lp3500 = RunLowPass(x, 3500f, sampleRate);

            float[][] bands = new float[4][];
            bands[0] = lp200;
            bands[1] = new float[totalSamples];
            bands[2] = new float[totalSamples];
            bands[3] = new float[totalSamples];

            for (int i = 0; i < totalSamples; i++) {
                bands[1][i] = lp900[i] - lp200[i];
                bands[2][i] = lp3500[i] - lp900[i];
                bands[3][i] = x[i] - lp3500[i];
            }

            // 2. Downsample with RMS energy envelope to 250 Hz (4ms precision frames)
            int hop = sampleRate / 250;
            if (hop < 1) hop = 1;
            int numFrames = totalSamples / hop;
            if (numFrames < 500) return 0;
            double frameRate = (double)sampleRate / hop;

            float[] combinedNovelty = new float[numFrames];
            float[] bandWeights = new float[] { 1.3f, 1.0f, 0.8f, 0.6f };

            for (int b = 0; b < 4; b++) {
                float[] bandEnergy = new float[numFrames];
                float[] bandSamples = bands[b];

                for (int f = 0; f < numFrames; f++) {
                    int start = f * hop;
                    int end = Math.Min(start + hop, totalSamples);
                    float sumSq = 0f;
                    int count = end - start;
                    for (int s = start; s < end; s++) {
                        float v = bandSamples[s];
                        sumSq += v * v;
                    }
                    bandEnergy[f] = (count > 0) ? (float)Math.Sqrt(sumSq / count) : 0f;
                }

                // Positive onset flux (half-wave rectified difference)
                float[] onset = new float[numFrames];
                for (int f = 1; f < numFrames; f++) {
                    float diff = bandEnergy[f] - bandEnergy[f - 1];
                    onset[f] = (diff > 0f) ? diff : 0f;
                }

                // Adaptive local mean subtraction (1-second moving average window)
                int avgWin = (int)(frameRate * 1.0);
                if (avgWin < 10) avgWin = 10;
                float runningSum = 0f;
                for (int f = 0; f < numFrames; f++) {
                    runningSum += onset[f];
                    if (f >= avgWin) {
                        runningSum -= onset[f - avgWin];
                        float localMean = runningSum / avgWin;
                        int targetIdx = f - avgWin / 2;
                        onset[targetIdx] = Math.Max(0f, onset[targetIdx] - localMean);
                    }
                }

                // Variance normalization per band
                float sumVal = 0f, sumValSq = 0f;
                for (int f = 0; f < numFrames; f++) {
                    sumVal += onset[f];
                    sumValSq += onset[f] * onset[f];
                }
                float mean = sumVal / numFrames;
                float variance = (sumValSq / numFrames) - (mean * mean);
                float stdDev = variance > 0.000001f ? (float)Math.Sqrt(variance) : 1f;

                float bw = bandWeights[b];
                for (int f = 0; f < numFrames; f++) {
                    combinedNovelty[f] += bw * (onset[f] / stdDev);
                }
            }

            // Zero-mean centering of novelty curve to eliminate DC slope drift in autocorrelation
            double sumNov = 0.0;
            for (int f = 0; f < numFrames; f++) sumNov += combinedNovelty[f];
            double meanNov = sumNov / numFrames;
            for (int f = 0; f < numFrames; f++) combinedNovelty[f] -= (float)meanNov;

            // 3. Autocorrelation calculation over lag intervals corresponding to 50 - 220 BPM
            int minLag = (int)Math.Floor(frameRate * 60.0 / 220.0);
            int maxLag = (int)Math.Ceiling(frameRate * 60.0 / 50.0);
            if (maxLag >= numFrames / 2) maxLag = (numFrames / 2) - 1;
            if (minLag < 2 || minLag >= maxLag) return 0;

            int totalLags = Math.Min(maxLag * 2 + 10, numFrames / 2);
            double[] autocorr = new double[totalLags + 1];

            for (int lag = minLag / 2; lag <= totalLags; lag++) {
                double sum = 0;
                int count = numFrames - lag;
                for (int i = 0; i < count; i++) {
                    sum += combinedNovelty[i] * combinedNovelty[i + lag];
                }
                autocorr[lag] = sum / count;
            }

            // 4. High-resolution continuous comb filter scan with Catmull-Rom interpolation (0.1 BPM step)
            double bestScore = -1000.0;
            double bestBpm = 0.0;

            for (double bpm = 58.0; bpm <= 205.0; bpm += 0.1) {
                double score = GetCombScore(bpm, autocorr, totalLags, frameRate);
                if (score > bestScore) {
                    bestScore = score;
                    bestBpm = bpm;
                }
            }

            if (bestBpm <= 0) return 0;

            // Fine local refinement (0.01 BPM step around top candidate) to eliminate quantization drift
            double refinedBpm = bestBpm;
            double localBestScore = bestScore;
            for (double bpm = bestBpm - 0.4; bpm <= bestBpm + 0.4; bpm += 0.01) {
                double score = GetCombScore(bpm, autocorr, totalLags, frameRate);
                if (score > localBestScore) {
                    localBestScore = score;
                    refinedBpm = bpm;
                }
            }
            bestBpm = refinedBpm;

            // 5. Metrical pulse & octave disambiguation (half-time vs double-time resolution)
            bestBpm = ResolveOctave(bestBpm, autocorr, totalLags, frameRate);

            return (int)Math.Round(bestBpm);
        }
    }
"@
}

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

# Optional BPM analysis fallback via acoustic detection (High-Accuracy Native C# + FFmpeg, with Librosa fallback).
function Get-AnalyzedBpm {
    param([string]$FilePath)

    if ([string]::IsNullOrWhiteSpace($FilePath)) {
        return ""
    }

    if ($global:bpmAnalysisCache.ContainsKey($FilePath)) {
        return [string]$global:bpmAnalysisCache[$FilePath]
    }

    $detectedBpm = ""

    # Priority 1: Multi-band FFmpeg extraction (22050 Hz, 40s window offset at 25s) + Sub-band Novelty Engine
    if ($global:ffmpegAvailable) {
        $tempPcm = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), [System.Guid]::NewGuid().ToString('N') + '.raw')
        try {
            $pinfo = New-Object System.Diagnostics.ProcessStartInfo
            $pinfo.FileName = "ffmpeg"
            $pinfo.Arguments = "-nostdin -v error -y -ss 25 -t 40 -i `"$FilePath`" -vn -ac 1 -ar 22050 -f s16le `"$tempPcm`""
            $pinfo.UseShellExecute = $false
            $pinfo.CreateNoWindow = $true

            $proc = [System.Diagnostics.Process]::Start($pinfo)
            if (-not $proc.WaitForExit(8000)) {
                $proc.Kill()
            }

            if (-not (Test-Path -LiteralPath $tempPcm) -or (Get-Item -LiteralPath $tempPcm).Length -lt 441000) {
                $pinfo.Arguments = "-nostdin -v error -y -ss 0 -t 40 -i `"$FilePath`" -vn -ac 1 -ar 22050 -f s16le `"$tempPcm`""
                $proc = [System.Diagnostics.Process]::Start($pinfo)
                if (-not $proc.WaitForExit(8000)) {
                    $proc.Kill()
                }
            }

            if ((Test-Path -LiteralPath $tempPcm) -and (Get-Item -LiteralPath $tempPcm).Length -ge 441000) {
                $calcBpm = [AudioBpmDetector]::DetectBpmFromPcmFile($tempPcm, 22050)
                if ($calcBpm -ge 50 -and $calcBpm -le 220) {
                    $detectedBpm = [string]$calcBpm
                }
            }
        } catch {
            $detectedBpm = ""
        } finally {
            if (Test-Path -LiteralPath $tempPcm) {
                Remove-Item -LiteralPath $tempPcm -Force -ErrorAction SilentlyContinue
            }
        }
    }

    # Priority 2: Python Librosa fallback with timeout guard
    if (-not $detectedBpm) {
        $pythonCmd = Get-Command python3 -ErrorAction SilentlyContinue
        if (-not $pythonCmd) {
            $pythonCmd = Get-Command python -ErrorAction SilentlyContinue
        }

        if ($pythonCmd) {
            $baseDir = if ($PSScriptRoot) { $PSScriptRoot } elseif ($root) { $root } else { (Get-Location).Path }
            $librosaScript = Join-Path $baseDir "scripts\bpm-detect-librosa.py"

            try {
                $pyPsi = New-Object System.Diagnostics.ProcessStartInfo
                $pyPsi.FileName = $pythonCmd.Source
                $pyPsi.UseShellExecute = $false
                $pyPsi.RedirectStandardOutput = $true
                $pyPsi.CreateNoWindow = $true

                if (Test-Path -LiteralPath $librosaScript) {
                    $pyPsi.Arguments = "`"$librosaScript`" `"$FilePath`""
                } else {
                    $inlinePy = "import sys, warnings; warnings.filterwarnings('ignore'); import numpy as np, librosa; y, sr = librosa.load(sys.argv[1], sr=11025, duration=25.0, offset=20.0); t, _ = librosa.beat.beat_track(y=y, sr=sr, start_bpm=120.0); b = float(np.atleast_1d(t)[0]); print(int(round(b))) if 40 <= b <= 240 else None"
                    $pyPsi.Arguments = "-c `"$inlinePy`" `"$FilePath`""
                }

                $pyProc = [System.Diagnostics.Process]::Start($pyPsi)
                $outTask = $pyProc.StandardOutput.ReadToEndAsync()
                if ($pyProc.WaitForExit(6000)) {
                    $pyOut = $outTask.Result
                    if ($pyOut -and ($pyOut.Trim() -match '^\d+$')) {
                        $parsed = [int]$pyOut.Trim()
                        if ($parsed -ge 40 -and $parsed -le 240) {
                            $detectedBpm = [string]$parsed
                        }
                    }
                } else {
                    $pyProc.Kill()
                }
            } catch { }
        }
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

# --- METADATA AUDIT & QUALITY ANALYSIS ENGINE -------------------------------
function Test-IsFieldEmpty($val) {
    if ($null -eq $val) { return $true }
    if ($val -is [string]) { return [string]::IsNullOrWhiteSpace($val) }
    if ($val -is [System.Collections.IEnumerable]) {
        $elemCount = 0
        foreach ($elem in $val) {
            if (-not (Test-IsFieldEmpty $elem)) {
                $elemCount++
            }
        }
        return ($elemCount -eq 0)
    }
    return $false
}

function Show-MetadataAudit {
    param(
        [System.Collections.Generic.List[object]]$Items,
        [string]$OutputRoot
    )

    if ($null -eq $Items -or $Items.Count -eq 0) {
        Write-Host "`n[WARNING] No items available to analyze in the database." -ForegroundColor Yellow
        return
    }

    $auditFields = @(
        [pscustomobject]@{ Id = 1;  Category = "Basic Info";   Key = "title";          Name = "Title";           Getter = { param($t) $t.metadata.title } }
        [pscustomobject]@{ Id = 2;  Category = "Basic Info";   Key = "artists";        Name = "Artists";         Getter = { param($t) $t.metadata.artists } }
        [pscustomobject]@{ Id = 3;  Category = "Basic Info";   Key = "album";          Name = "Album";           Getter = { param($t) $t.metadata.album } }
        [pscustomobject]@{ Id = 4;  Category = "Basic Info";   Key = "album_artist";   Name = "Album Artist";    Getter = { param($t) $t.metadata.album_artist } }
        [pscustomobject]@{ Id = 5;  Category = "Basic Info";   Key = "genre";          Name = "Genre";           Getter = { param($t) $t.metadata.genre } }
        [pscustomobject]@{ Id = 6;  Category = "Basic Info";   Key = "year";           Name = "Year / Date";     Getter = { param($t) $t.metadata.year } }
        [pscustomobject]@{ Id = 7;  Category = "Basic Info";   Key = "composer";       Name = "Composer";        Getter = { param($t) $t.metadata.composer } }
        [pscustomobject]@{ Id = 8;  Category = "Track / Disc"; Key = "track_number";   Name = "Track Number";    Getter = { param($t) $t.metadata.track_number } }
        [pscustomobject]@{ Id = 9;  Category = "Track / Disc"; Key = "total_tracks";   Name = "Total Tracks";    Getter = { param($t) $t.metadata.total_tracks } }
        [pscustomobject]@{ Id = 10; Category = "Track / Disc"; Key = "disc_number";    Name = "Disc Number";     Getter = { param($t) $t.metadata.disc_number } }
        [pscustomobject]@{ Id = 11; Category = "Track / Disc"; Key = "total_discs";    Name = "Total Discs";     Getter = { param($t) $t.metadata.total_discs } }
        [pscustomobject]@{ Id = 12; Category = "Musical";      Key = "bpm";            Name = "BPM / Tempo";     Getter = { param($t) $t.metadata.bpm } }
        [pscustomobject]@{ Id = 13; Category = "Musical";      Key = "mood";           Name = "Mood";            Getter = { param($t) $t.metadata.mood } }
        [pscustomobject]@{ Id = 14; Category = "Editorial";    Key = "lyrics";         Name = "Lyrics";          Getter = { param($t) $t.metadata.lyrics } }
        [pscustomobject]@{ Id = 15; Category = "Editorial";    Key = "comment";        Name = "Comment";         Getter = { param($t) $t.metadata.comment } }
        [pscustomobject]@{ Id = 16; Category = "Editorial";    Key = "description";    Name = "Description";     Getter = { param($t) $t.metadata.description } }
        [pscustomobject]@{ Id = 17; Category = "Credits";      Key = "producer";       Name = "Producer";        Getter = { param($t) $t.metadata.producer } }
        [pscustomobject]@{ Id = 18; Category = "Credits";      Key = "remix_artist";   Name = "Remix Artist";    Getter = { param($t) $t.metadata.remix_artist } }
        [pscustomobject]@{ Id = 19; Category = "Publishing";   Key = "label";          Name = "Record Label";    Getter = { param($t) $t.metadata.label } }
        [pscustomobject]@{ Id = 20; Category = "Publishing";   Key = "publisher";      Name = "Publisher";       Getter = { param($t) $t.metadata.publisher } }
        [pscustomobject]@{ Id = 21; Category = "Publishing";   Key = "edition";        Name = "Edition / Ver.";  Getter = { param($t) $t.metadata.edition } }
        [pscustomobject]@{ Id = 22; Category = "Publishing";   Key = "recording_year"; Name = "Recording Year"; Getter = { param($t) $t.metadata.recording_year } }
        [pscustomobject]@{ Id = 23; Category = "Identifiers";  Key = "isrc";           Name = "ISRC Code";       Getter = { param($t) $t.metadata.isrc } }
        [pscustomobject]@{ Id = 24; Category = "Identifiers";  Key = "upc";            Name = "UPC / Barcode";   Getter = { param($t) $t.metadata.upc } }
        [pscustomobject]@{ Id = 25; Category = "Additional";   Key = "language";       Name = "Language";        Getter = { param($t) $t.metadata.language } }
        [pscustomobject]@{ Id = 26; Category = "Additional";   Key = "category";       Name = "Category / Group";Getter = { param($t) $t.metadata.category } }
        [pscustomobject]@{ Id = 27; Category = "Additional";   Key = "tags";           Name = "Tags / Keywords"; Getter = { param($t) $t.metadata.tags } }
        [pscustomobject]@{ Id = 28; Category = "Links";        Key = "video_link";     Name = "Video Link";      Getter = { param($t) $t.metadata.video_link } }
        [pscustomobject]@{ Id = 29; Category = "Links";        Key = "streaming_link"; Name = "Streaming Link";  Getter = { param($t) $t.metadata.streaming_link } }
        [pscustomobject]@{ Id = 30; Category = "Audio Specs";  Key = "duration";       Name = "Duration";        Getter = { param($t) $t.audio_specs.duration } }
        [pscustomobject]@{ Id = 31; Category = "Audio Specs";  Key = "bitrate";        Name = "Bitrate";         Getter = { param($t) $t.audio_specs.bitrate } }
        [pscustomobject]@{ Id = 32; Category = "Audio Specs";  Key = "sample_rate";    Name = "Sample Rate";     Getter = { param($t) $t.audio_specs.sample_rate } }
        [pscustomobject]@{ Id = 33; Category = "Audio Specs";  Key = "channels";       Name = "Channels";        Getter = { param($t) $t.audio_specs.channels } }
        [pscustomobject]@{ Id = 34; Category = "Audio Specs";  Key = "codec";          Name = "Audio Codec";     Getter = { param($t) $t.audio_specs.codec } }
        [pscustomobject]@{ Id = 35; Category = "Visuals";      Key = "track_artwork";  Name = "Track Artwork";   Getter = { param($t) $t.artworks.track_artwork } }
        [pscustomobject]@{ Id = 36; Category = "Visuals";      Key = "album_artwork";  Name = "Album Artwork";   Getter = { param($t) $t.artworks.album_artwork } }
    )

    $currentFilterExt = ""

    while ($true) {
        $activeItems = if ([string]::IsNullOrWhiteSpace($currentFilterExt)) {
            @($Items)
        } else {
            @($Items | Where-Object {
                $ext = if ($_.file -and $_.file.ext) { $_.file.ext.ToString().ToUpperInvariant().TrimStart('.') } else { "" }
                $ext -eq $currentFilterExt.ToUpperInvariant().TrimStart('.')
            })
        }

        $totalActive = $activeItems.Count

        Clear-Host
        Write-Host "=========================================================================================" -ForegroundColor Cyan
        Write-Host "                          METADATA QUALITY & COMPLETENESS AUDIT                          " -ForegroundColor Cyan
        Write-Host "=========================================================================================" -ForegroundColor Cyan
        $filterStatus = if ($currentFilterExt) { "Filtered by extension: .$($currentFilterExt.ToUpper())" } else { "All file formats" }
        Write-Host " Auditing: $totalActive track version(s) ($filterStatus)" -ForegroundColor Gray
        Write-Host ""

        if ($totalActive -eq 0) {
            Write-Host "No tracks match the active format filter." -ForegroundColor Yellow
            Write-Host "Press any key to reset filter..."
            $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
            $currentFilterExt = ""
            continue
        }

        $statsList = @()
        $totalFieldsSlots = $totalActive * $auditFields.Count
        $totalPopulatedSlots = 0

        foreach ($field in $auditFields) {
            $missingItems = @($activeItems | Where-Object { Test-IsFieldEmpty (& $field.Getter $_) })
            $missingCount = $missingItems.Count
            $filledCount = $totalActive - $missingCount
            $totalPopulatedSlots += $filledCount

            $missPct = if ($totalActive -gt 0) { [Math]::Round(($missingCount / $totalActive) * 100, 1) } else { 0.0 }
            $fillPct = if ($totalActive -gt 0) { [Math]::Round(($filledCount / $totalActive) * 100, 1) } else { 0.0 }

            $statsList += [pscustomobject]@{
                Id           = $field.Id
                Category     = $field.Category
                Key          = $field.Key
                Name         = $field.Name
                Filled       = $filledCount
                Missing      = $missingCount
                MissingPct   = $missPct
                FilledPct    = $fillPct
                MissingItems = $missingItems
                Getter       = $field.Getter
            }
        }

        $overallCompletenessPct = [Math]::Round(($totalPopulatedSlots / $totalFieldsSlots) * 100, 1)

        Write-Host (" {0,-4} | {1,-14} | {2,-17} | {3,6} | {4,7} | {5,7} | {6,-12}" -f "ID", "Category", "Metadata Field", "Filled", "Missing", "Miss %", "Health Bar") -ForegroundColor Yellow
        Write-Host (" " + ("-" * 80)) -ForegroundColor DarkGray

        foreach ($row in $statsList) {
            $filledBlocks = [int][Math]::Round(($row.FilledPct / 100.0) * 10)
            if ($filledBlocks -gt 10) { $filledBlocks = 10 }
            if ($filledBlocks -lt 0) { $filledBlocks = 0 }
            $emptyBlocks = 10 - $filledBlocks
            $healthBar = ("#" * $filledBlocks) + ("-" * $emptyBlocks)

            $rowColor = if ($row.MissingCount -eq 0) {
                "Green"
            } elseif ($row.MissingPct -lt 25.0) {
                "Cyan"
            } elseif ($row.MissingPct -lt 70.0) {
                "Yellow"
            } else {
                "Red"
            }

            Write-Host (" {0,4} | {1,-14} | {2,-17} | {3,6} | {4,7} | {5,6:N1}% | [{6}]" -f `
                $row.Id, $row.Category, $row.Name, $row.Filled, $row.Missing, $row.MissingPct, $healthBar) -ForegroundColor $rowColor
        }

        Write-Host (" " + ("-" * 80)) -ForegroundColor DarkGray
        $globalScoreColor = if ($overallCompletenessPct -ge 80) { "Green" } elseif ($overallCompletenessPct -ge 50) { "Yellow" } else { "Red" }
        Write-Host (" Overall Library Metadata Health Score: {0}% ({1}/{2} total slots populated)" -f $overallCompletenessPct, $totalPopulatedSlots, $totalFieldsSlots) -ForegroundColor $globalScoreColor
        Write-Host ""
        Write-Host " Available Actions:" -ForegroundColor Yellow
        Write-Host "  [1] List tracks missing a specific metadata category / field"
        Write-Host "  [2] View tracks with lowest metadata completeness (Top uncompleted)"
        Write-Host "  [3] View category summary breakdown (Basic, Audio, Visuals, etc.)"
        Write-Host "  [4] Filter audit by audio format / file extension"
        Write-Host "  [5] Export complete metadata audit report to file (JSON & TXT)"
        Write-Host "  [0] Exit audit mode"
        Write-Host ""

        $choice = Read-Host "Select an action [0-5]"
        switch ($choice) {
            "1" {
                Write-Host ""
                $inputField = Read-Host "Enter Field ID [1-36] or Field Name (or 'b' to go back)"
                if ($inputField -ieq 'b' -or [string]::IsNullOrWhiteSpace($inputField)) {
                    continue
                }

                $selectedStat = $null
                $parsedId = 0
                if ([int]::TryParse($inputField, [ref]$parsedId)) {
                    $selectedStat = $statsList | Where-Object { $_.Id -eq $parsedId } | Select-Object -First 1
                } else {
                    $selectedStat = $statsList | Where-Object { $_.Name -like "*$inputField*" -or $_.Key -like "*$inputField*" } | Select-Object -First 1
                }

                if (-not $selectedStat) {
                    Write-Host "`n[ERROR] No metadata field matching '$inputField' was found." -ForegroundColor Red
                    Start-Sleep -Seconds 2
                    continue
                }

                $missingTrackList = $selectedStat.MissingItems
                Write-Host ""
                Write-Host "=========================================================================================" -ForegroundColor Cyan
                Write-Host (" MISSING DATA REPORT: [{0}] - {1}" -f $selectedStat.Category, $selectedStat.Name) -ForegroundColor Cyan
                Write-Host (" Found {0} track(s) missing this field out of {1} total ({2}% missing)" -f $missingTrackList.Count, $totalActive, $selectedStat.MissingPct) -ForegroundColor Yellow
                Write-Host "=========================================================================================" -ForegroundColor Cyan

                if ($missingTrackList.Count -eq 0) {
                    Write-Host "`n[EXCELLENT] All tracks have this metadata field populated!" -ForegroundColor Green
                    Write-Host "`nPress any key to return..."
                    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
                    continue
                }

                $pageSize = 25
                $offset = 0
                $stayInList = $true

                while ($stayInList) {
                    $end = [Math]::Min($offset + $pageSize, $missingTrackList.Count)
                    Write-Host ""
                    Write-Host (" Showing tracks {0} to {1} of {2}:" -f ($offset + 1), $end, $missingTrackList.Count) -ForegroundColor Gray
                    Write-Host ""

                    for ($idx = $offset; $idx -lt $end; $idx++) {
                        $track = $missingTrackList[$idx]
                        $tTitle = if ($track.metadata -and $track.metadata.title) { $track.metadata.title } else { "(No Title)" }
                        $tExt = if ($track.file -and $track.file.ext) { $track.file.ext } else { "" }
                        $tPath = if ($track.file -and $track.file.path) { $track.file.path } else { "" }
                        Write-Host ("  [{0,4}] {1,-32} [.{2}]  Path: {3}" -f ($idx + 1), $tTitle, $tExt, $tPath) -ForegroundColor Yellow
                    }

                    Write-Host ""
                    Write-Host " Navigation: [N] Next page | [P] Previous page | [E] Export this list | [B] Back to audit" -ForegroundColor Cyan
                    $navChoice = Read-Host "Choose option"

                    if ($navChoice -ieq 'n') {
                        if ($offset + $pageSize -lt $missingTrackList.Count) {
                            $offset += $pageSize
                        } else {
                            Write-Host "Already on the last page." -ForegroundColor Gray
                        }
                    } elseif ($navChoice -ieq 'p') {
                        if ($offset -ge $pageSize) {
                            $offset -= $pageSize
                        } else {
                            Write-Host "Already on the first page." -ForegroundColor Gray
                        }
                    } elseif ($navChoice -ieq 'e') {
                        $exportName = "missing_" + ($selectedStat.Key -replace '[^a-zA-Z0-9_]', '_') + ".txt"
                        $exportPath = Join-Path $OutputRoot $exportName
                        $exportLines = @(
                            "========================================================="
                            "Tracks missing: $($selectedStat.Name) ($($selectedStat.Category))"
                            "Total missing: $($missingTrackList.Count) / $totalActive"
                            "Exported on: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
                            "========================================================="
                            ""
                        )
                        foreach ($t in $missingTrackList) {
                            $tTitle = if ($t.metadata -and $t.metadata.title) { $t.metadata.title } else { "(No Title)" }
                            $tPath = if ($t.file -and $t.file.path) { $t.file.path } else { "" }
                            $exportLines += "$tTitle`t$tPath"
                        }
                        [System.IO.File]::WriteAllLines($exportPath, $exportLines, [System.Text.Encoding]::UTF8)
                        Write-Host "`n[SUCCESS] Exported missing list to: $exportPath" -ForegroundColor Green
                        Start-Sleep -Seconds 2
                    } else {
                        $stayInList = $false
                    }
                }
            }
            "2" {
                Write-Host ""
                Write-Host "=========================================================================================" -ForegroundColor Cyan
                Write-Host "                    TRACKS WITH LOWEST COMPLETENESS (TOP UNCOMPLETED)                    " -ForegroundColor Cyan
                Write-Host "=========================================================================================" -ForegroundColor Cyan

                $scoredTracks = foreach ($t in $activeItems) {
                    $missingCountForTrack = 0
                    $missingFieldNames = @()
                    foreach ($f in $auditFields) {
                        if (Test-IsFieldEmpty (& $f.Getter $t)) {
                            $missingCountForTrack++
                            $missingFieldNames += $f.Name
                        }
                    }
                    $fillPercent = [Math]::Round((($auditFields.Count - $missingCountForTrack) / $auditFields.Count) * 100, 1)
                    [pscustomobject]@{
                        Track = $t
                        MissingCount = $missingCountForTrack
                        FillPercent = $fillPercent
                        MissingFields = $missingFieldNames
                    }
                }

                $worstTracks = @($scoredTracks | Sort-Object -Property MissingCount -Descending | Select-Object -First 20)

                Write-Host (" {0,-4} | {1,8} | {2,8} | {3,-30} | {4}" -f "Rank", "Missing", "Filled %", "Track Title / File", "Path") -ForegroundColor Yellow
                Write-Host (" " + ("-" * 80)) -ForegroundColor DarkGray

                $rank = 1
                foreach ($item in $worstTracks) {
                    $t = $item.Track
                    $tName = if ($t.metadata -and $t.metadata.title) { $t.metadata.title } elseif ($t.file -and $t.file.name) { $t.file.name } else { "Unknown" }
                    if ($tName.Length -gt 28) { $tName = $tName.Substring(0, 25) + "..." }
                    $tPath = if ($t.file -and $t.file.path) { $t.file.path } else { "" }
                    $color = if ($item.FillPercent -lt 40.0) { "Red" } elseif ($item.FillPercent -lt 65.0) { "Yellow" } else { "Cyan" }

                    Write-Host (" {0,4} | {1,8} | {2,7:N1}% | {3,-30} | {4}" -f $rank, $item.MissingCount, $item.FillPercent, $tName, $tPath) -ForegroundColor $color
                    $rank++
                }

                Write-Host "`nPress any key to return..."
                $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
            }
            "3" {
                Write-Host ""
                Write-Host "=========================================================================================" -ForegroundColor Cyan
                Write-Host "                               METADATA CATEGORY BREAKDOWN                               " -ForegroundColor Cyan
                Write-Host "=========================================================================================" -ForegroundColor Cyan

                $categories = $auditFields | Select-Object -ExpandProperty Category -Unique

                Write-Host (" {0,-16} | {1,6} | {2,11} | {3,11} | {4,8} | {5,-12}" -f "Category", "Fields", "Total Slots", "Filled Slots", "Filled %", "Status") -ForegroundColor Yellow
                Write-Host (" " + ("-" * 75)) -ForegroundColor DarkGray

                foreach ($cat in $categories) {
                    $catFields = @($auditFields | Where-Object { $_.Category -eq $cat })
                    $catTotalSlots = $catFields.Count * $totalActive
                    $catFilledSlots = 0

                    foreach ($f in $catFields) {
                        $miss = @($activeItems | Where-Object { Test-IsFieldEmpty (& $f.Getter $_) }).Count
                        $catFilledSlots += ($totalActive - $miss)
                    }

                    $catFillPct = if ($catTotalSlots -gt 0) { [Math]::Round(($catFilledSlots / $catTotalSlots) * 100, 1) } else { 0.0 }
                    $filledBlocks = [int][Math]::Round(($catFillPct / 100.0) * 10)
                    $bar = ("#" * $filledBlocks) + ("-" * (10 - $filledBlocks))

                    $catColor = if ($catFillPct -ge 80.0) { "Green" } elseif ($catFillPct -ge 50.0) { "Yellow" } else { "Red" }
                    Write-Host (" {0,-16} | {1,6} | {2,11} | {3,11} | {4,7:N1}% | [{5}]" -f $cat, $catFields.Count, $catTotalSlots, $catFilledSlots, $catFillPct, $bar) -ForegroundColor $catColor
                }

                Write-Host "`nPress any key to return..."
                $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
            }
            "4" {
                Write-Host ""
                $availableExts = @($Items | ForEach-Object { if ($_.file -and $_.file.ext) { $_.file.ext.ToString().ToUpperInvariant().TrimStart('.') } } | Where-Object { $_ } | Select-Object -Unique | Sort-Object)
                Write-Host "Available audio extensions in dataset:" -ForegroundColor Cyan
                Write-Host " [0] Clear filter (Analyze all formats)"
                for ($i = 0; $i -lt $availableExts.Count; $i++) {
                    $extCount = @($Items | Where-Object { $_.file -and $_.file.ext -and ($_.file.ext.ToString().ToUpperInvariant().TrimStart('.') -eq $availableExts[$i]) }).Count
                    Write-Host (" [{0}] .{1} ({2} tracks)" -f ($i + 1), $availableExts[$i], $extCount)
                }

                Write-Host ""
                $filterChoice = Read-Host "Select an option"
                $filterChoiceInt = 0
                if ([int]::TryParse($filterChoice, [ref]$filterChoiceInt)) {
                    if ($filterChoiceInt -eq 0) {
                        $currentFilterExt = ""
                    } elseif ($filterChoiceInt -ge 1 -and $filterChoiceInt -le $availableExts.Count) {
                        $currentFilterExt = $availableExts[$filterChoiceInt - 1]
                    }
                }
            }
            "5" {
                Write-Host ""
                Write-Host "Exporting comprehensive audit reports..." -ForegroundColor Cyan

                $reportDate = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
                $jsonExportPath = Join-Path $OutputRoot "metadata_audit_$reportDate.json"
                $txtExportPath = Join-Path $OutputRoot "metadata_audit_$reportDate.txt"

                $exportPayload = [ordered]@{
                    audit_date = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
                    total_tracks_analyzed = $totalActive
                    active_filter = if ($currentFilterExt) { ".$currentFilterExt" } else { "ALL" }
                    overall_completeness_percent = $overallCompletenessPct
                    fields_summary = @()
                }

                $txtLines = @(
                    "========================================================================================="
                    "                               MUSIC METADATA AUDIT REPORT                               "
                    "========================================================================================="
                    "Date: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
                    "Total tracks analyzed: $totalActive"
                    "Filter: $filterStatus"
                    "Overall Completeness Score: $overallCompletenessPct%"
                    "========================================================================================="
                    ""
                    ("{0,-4} | {1,-14} | {2,-18} | {3,6} | {4,7} | {5,8}" -f "ID", "Category", "Field Name", "Filled", "Missing", "Miss %")
                    ("-" * 75)
                )

                foreach ($row in $statsList) {
                    $exportPayload.fields_summary += [ordered]@{
                        id = $row.Id
                        category = $row.Category
                        name = $row.Name
                        key = $row.Key
                        filled_count = $row.Filled
                        missing_count = $row.Missing
                        missing_percent = $row.MissingPct
                        filled_percent = $row.FilledPct
                        missing_paths = @($row.MissingItems | ForEach-Object { if ($_.file -and $_.file.path) { $_.file.path } })
                    }

                    $txtLines += ("{0,4} | {1,-14} | {2,-18} | {3,6} | {4,7} | {5,7:N1}%" -f $row.Id, $row.Category, $row.Name, $row.Filled, $row.Missing, $row.MissingPct)
                }

                $jsonText = $exportPayload | ConvertTo-Json -Depth 10
                [System.IO.File]::WriteAllText($jsonExportPath, $jsonText, [System.Text.Encoding]::UTF8)
                [System.IO.File]::WriteAllLines($txtExportPath, $txtLines, [System.Text.Encoding]::UTF8)

                Write-Host "[SUCCESS] JSON audit saved to: $jsonExportPath" -ForegroundColor Green
                Write-Host "[SUCCESS] TXT audit saved to:  $txtExportPath" -ForegroundColor Green
                Write-Host "`nPress any key to return..."
                $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
            }
            "0" {
                return
            }
            Default {
                continue
            }
        }
    }
}

# Load existing database if present for incremental mode or partial merges
$existingDbItems = [System.Collections.Generic.List[object]]::new()
$existingPaths = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)

if (Test-Path -LiteralPath $output) {
    try {
        $jsonContent = Get-Content -LiteralPath $output -Raw -Encoding UTF8
        $parsedDb = $jsonContent | ConvertFrom-Json
        if ($parsedDb -and $parsedDb.items) {
            foreach ($dbItem in $parsedDb.items) {
                $existingDbItems.Add($dbItem)
                if ($dbItem.file -and $dbItem.file.path) {
                    [void]$existingPaths.Add($dbItem.file.path)
                }
            }
        }
    } catch {
        Write-Warning "Could not load existing database: $_"
    }
}

# Scan all audio files in the assets directory
$allAudioFiles = @(Get-ChildItem -Path $assetsPath -Recurse -File | Where-Object { $audioExt -contains $_.Extension.ToLower() })

# Display interactive indexing menu
Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "             MUSIC DATABASE INDEXER             " -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "Found $($allAudioFiles.Count) total audio file(s) in assets." -ForegroundColor Gray
Write-Host "Currently $($existingDbItems.Count) track(s) registered in database." -ForegroundColor Gray
Write-Host ""
Write-Host "Choose an indexing option:" -ForegroundColor Yellow
Write-Host " [1] All tracks (Full re-indexing)"
Write-Host " [2] Only unindexed tracks (Incremental)"
Write-Host " [3] Specific folder / directory"
Write-Host " [4] Specific album"
Write-Host " [5] Specific track / file keyword"
Write-Host " [6] Metadata analysis & audit mode (Inspect missing data)"
Write-Host " [7] Dedicated BPM audio detector (Acoustic analysis only)"
Write-Host ""

$selectedMode = Read-Host "Select option [1-7] (default: 1)"
if ([string]::IsNullOrWhiteSpace($selectedMode)) { $selectedMode = "1" }

$runAuditAfter = $false
$enableBpmAnalysis = $false

# Dedicated BPM acoustic detection mode
if ($selectedMode -eq "7") {
    if ($existingDbItems.Count -eq 0) {
        Write-Host "`n[ERROR] No database found at $output." -ForegroundColor Red
        Write-Host "Please run indexation first before performing BPM detection." -ForegroundColor Yellow
        return
    }

    Write-Host ""
    Write-Host "================================================" -ForegroundColor Cyan
    Write-Host "          ACOUSTIC BPM DETECTION MODE           " -ForegroundColor Cyan
    Write-Host "================================================" -ForegroundColor Cyan
    Write-Host " [1] Analyze only tracks with missing BPM (Recommended)"
    Write-Host " [2] Force acoustic BPM detection on all tracks (Overwrite)"
    Write-Host " [3] Analyze specific track keyword or filter"
    Write-Host ""

    $bpmTargetMode = Read-Host "Select target [1-3] (default: 1)"
    if ([string]::IsNullOrWhiteSpace($bpmTargetMode)) { $bpmTargetMode = "1" }

    $targetItems = switch ($bpmTargetMode) {
        "2" {
            @($existingDbItems)
        }
        "3" {
            $kw = Read-Host "Enter track filename or keyword to match"
            @($existingDbItems | Where-Object {
                $name = if ($_.metadata -and $_.metadata.title) { $_.metadata.title } elseif ($_.file -and $_.file.name) { $_.file.name } else { "" }
                $name -like "*$kw*"
            })
        }
        Default {
            @($existingDbItems | Where-Object {
                Test-IsFieldEmpty $_.metadata.bpm
            })
        }
    }

    if ($targetItems.Count -eq 0) {
        Write-Host "`n[INFO] No tracks found matching the criteria." -ForegroundColor Yellow
        return
    }

    Write-Host "`nStarting acoustic BPM analysis on $($targetItems.Count) track(s)..." -ForegroundColor Cyan
    $bpmTimer = [System.Diagnostics.Stopwatch]::StartNew()
    $detectedCount = 0
    $processedCount = 0

    for ($i = 0; $i -lt $targetItems.Count; $i++) {
        $trackItem = $targetItems[$i]
        $processedCount++
        $trackRelPath = if ($trackItem.file -and $trackItem.file.path) { $trackItem.file.path } else { "" }
        $fullPath = Join-Path $root $trackRelPath
        $tTitle = if ($trackItem.metadata -and $trackItem.metadata.title) { $trackItem.metadata.title } else { $trackItem.file.name }

        $pct = ($processedCount / $targetItems.Count) * 100
        Write-Progress -Activity "Acoustic BPM Detection" -Status "[$processedCount/$($targetItems.Count)] $tTitle" -PercentComplete $pct

        if (Test-Path -LiteralPath $fullPath) {
            $detected = Get-AnalyzedBpm -FilePath $fullPath
            if (-not [string]::IsNullOrWhiteSpace($detected)) {
                $trackItem.metadata.bpm = $detected
                $trackItem.metadata.bpm_source = "analysis"
                $detectedCount++
                Write-Host (" [{0}/{1}] DETECTED: {2} BPM -> {3}" -f $processedCount, $targetItems.Count, $detected, $tTitle) -ForegroundColor Green
            } else {
                Write-Host (" [{0}/{1}] FAILED: No BPM detected -> {2}" -f $processedCount, $targetItems.Count, $tTitle) -ForegroundColor DarkGray
            }
        } else {
            Write-Host (" [{0}/{1}] SKIPPED: File not found -> {2}" -f $processedCount, $targetItems.Count, $trackRelPath) -ForegroundColor Yellow
        }
    }

    Write-Progress -Activity "Acoustic BPM Detection" -Completed
    $bpmTimer.Stop()

    Write-Host "`nBPM analysis finished in $($bpmTimer.Elapsed.TotalSeconds.ToString('F1'))s. Detected: $detectedCount / $($targetItems.Count)" -ForegroundColor Cyan
    Write-Host "Saving updated database to $output..." -ForegroundColor Cyan

    $finalData = [ordered]@{
        info = [ordered]@{
            date = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
            total_tracks_versions = $existingDbItems.Count
            execution_time_ms = $bpmTimer.ElapsedMilliseconds
        }
        items = $existingDbItems
    }

    $rawJsonLines = ($finalData | ConvertTo-Json -Depth 20) -split "`r?`n"
    $optimizedJson = foreach ($line in $rawJsonLines) {
        if ($line -match '^(\s+)(.*)$') {
            $currentSpaces = $matches[1].Length
            $newIndentLevel = [math]::Floor($currentSpaces / 4)
            if ($newIndentLevel -le 0) { $newIndentLevel = 1 }
            $newIndent = " " * $newIndentLevel
            $newIndent + $matches[2]
        } else {
            $line
        }
    }

    [System.IO.File]::WriteAllLines($output, $optimizedJson, (New-Object System.Text.UTF8Encoding($false)))
    Write-Host "[SUCCESS] Database updated with newly analyzed BPM values!`n" -ForegroundColor Green
    return
}

# Ask user whether acoustic BPM detection should be enabled as a fallback (Default: No)
if ($selectedMode -in @("1", "2", "3", "4", "5")) {
    $bpmPrompt = Read-Host "Enable audio acoustic BPM analysis fallback? (Can be slow) [y/N] (default: N)"
    if ($bpmPrompt -ieq 'y') {
        $enableBpmAnalysis = $true
        Write-Host "Acoustic BPM analysis fallback: ENABLED" -ForegroundColor Green
    } else {
        $enableBpmAnalysis = $false
        Write-Host "Acoustic BPM analysis fallback: DISABLED (Using tags/heuristics only)" -ForegroundColor Gray
    }
}

if ($selectedMode -eq "6") {
    if ($existingDbItems.Count -eq 0) {
        Write-Host "`n[WARNING] No existing database found at $output." -ForegroundColor Yellow
        Write-Host "An index must be created first before performing metadata analysis." -ForegroundColor Yellow
        $promptRunIndex = Read-Host "Would you like to index all tracks now and then audit? [Y/n]"
        if ($promptRunIndex -ne 'n' -and $promptRunIndex -ne 'N') {
            $selectedMode = "1"
            $runAuditAfter = $true
        } else {
            Write-Host "Audit cancelled. Exiting..." -ForegroundColor Gray
            return
        }
    } else {
        Show-MetadataAudit -Items $existingDbItems -OutputRoot $root
        return
    }
}

$files = switch ($selectedMode) {
    "2" {
        @( $allAudioFiles | Where-Object {
            $rel = Get-Rel $_.FullName $root
            -not $existingPaths.Contains($rel)
        })
    }
    "3" {
        $targetFolder = Read-Host "Enter folder name or partial path"
        if ([string]::IsNullOrWhiteSpace($targetFolder)) {
            Write-Host "No folder specified. Falling back to all tracks." -ForegroundColor Yellow
            $allAudioFiles
        } else {
            @( $allAudioFiles | Where-Object { $_.DirectoryName -like "*$targetFolder*" } )
        }
    }
    "4" {
        $targetAlbum = Read-Host "Enter album name"
        if ([string]::IsNullOrWhiteSpace($targetAlbum)) {
            Write-Host "No album specified. Falling back to all tracks." -ForegroundColor Yellow
            $allAudioFiles
        } else {
            @( $allAudioFiles | Where-Object {
                $rel = Get-Rel $_.DirectoryName $assetsPath
                $parts = $rel -split '\\'
                ($parts -contains $targetAlbum) -or ($_.DirectoryName -like "*$targetAlbum*")
            })
        }
    }
    "5" {
        $targetTrack = Read-Host "Enter track filename or keyword"
        if ([string]::IsNullOrWhiteSpace($targetTrack)) {
            Write-Host "No keyword specified. Falling back to all tracks." -ForegroundColor Yellow
            $allAudioFiles
        } else {
            @( $allAudioFiles | Where-Object { $_.BaseName -like "*$targetTrack*" -or $_.Name -like "*$targetTrack*" } )
        }
    }
    Default {
        $allAudioFiles
    }
}

$total = $files.Count
$results = [System.Collections.Generic.List[PSCustomObject]]::new()
$timer = [System.Diagnostics.Stopwatch]::StartNew()

if ($total -eq 0) {
    Write-Host "`n[INFO] No audio files matched the selected criteria." -ForegroundColor Yellow
    if ($selectedMode -ne "1" -and $existingDbItems.Count -gt 0) {
        Write-Host "Existing database was kept intact." -ForegroundColor Green
        return
    }
} else {
    $workerScript = {
        param($FileData, $Root, $AudioExt, $LosslessExt, $ImgExt, $EnableBpmAnalysis = $false)

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

            # Priority 1: Multi-band FFmpeg extraction (22050 Hz, 40s window offset at 25s) + Sub-band Novelty Engine
            if ($ffmpegAvailable) {
                $tempPcm = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), [System.Guid]::NewGuid().ToString('N') + '.raw')
                try {
                    $pinfo = New-Object System.Diagnostics.ProcessStartInfo
                    $pinfo.FileName = "ffmpeg"
                    $pinfo.Arguments = "-nostdin -v error -y -ss 25 -t 40 -i `"$FilePath`" -vn -ac 1 -ar 22050 -f s16le `"$tempPcm`""
                    $pinfo.UseShellExecute = $false
                    $pinfo.CreateNoWindow = $true

                    $proc = [System.Diagnostics.Process]::Start($pinfo)
                    if (-not $proc.WaitForExit(8000)) {
                        $proc.Kill()
                    }

                    if (-not (Test-Path -LiteralPath $tempPcm) -or (Get-Item -LiteralPath $tempPcm).Length -lt 441000) {
                        $pinfo.Arguments = "-nostdin -v error -y -ss 0 -t 40 -i `"$FilePath`" -vn -ac 1 -ar 22050 -f s16le `"$tempPcm`""
                        $proc = [System.Diagnostics.Process]::Start($pinfo)
                        if (-not $proc.WaitForExit(8000)) {
                            $proc.Kill()
                        }
                    }

                    if ((Test-Path -LiteralPath $tempPcm) -and (Get-Item -LiteralPath $tempPcm).Length -ge 441000) {
                        $calcBpm = [AudioBpmDetector]::DetectBpmFromPcmFile($tempPcm, 22050)
                        if ($calcBpm -ge 50 -and $calcBpm -le 220) {
                            $detectedBpm = [string]$calcBpm
                        }
                    }
                } catch {
                    $detectedBpm = ""
                } finally {
                    if (Test-Path -LiteralPath $tempPcm) {
                        Remove-Item -LiteralPath $tempPcm -Force -ErrorAction SilentlyContinue
                    }
                }
            }

            # Priority 2: Python Librosa fallback with timeout guard
            if (-not $detectedBpm) {
                $pythonCmd = Get-Command python3 -ErrorAction SilentlyContinue
                if (-not $pythonCmd) {
                    $pythonCmd = Get-Command python -ErrorAction SilentlyContinue
                }

                if ($pythonCmd) {
                    $baseDir = if ($Root) { $Root } elseif ($PSScriptRoot) { $PSScriptRoot } else { (Get-Location).Path }
                    $librosaScript = Join-Path $baseDir "scripts\bpm-detect-librosa.py"

                    try {
                        $pyPsi = New-Object System.Diagnostics.ProcessStartInfo
                        $pyPsi.FileName = $pythonCmd.Source
                        $pyPsi.UseShellExecute = $false
                        $pyPsi.RedirectStandardOutput = $true
                        $pyPsi.CreateNoWindow = $true

                        if (Test-Path -LiteralPath $librosaScript) {
                            $pyPsi.Arguments = "`"$librosaScript`" `"$FilePath`""
                        } else {
                            $inlinePy = "import sys, warnings; warnings.filterwarnings('ignore'); import numpy as np, librosa; y, sr = librosa.load(sys.argv[1], sr=11025, duration=25.0, offset=20.0); t, _ = librosa.beat.beat_track(y=y, sr=sr, start_bpm=120.0); b = float(np.atleast_1d(t)[0]); print(int(round(b))) if 40 <= b <= 240 else None"
                            $pyPsi.Arguments = "-c `"$inlinePy`" `"$FilePath`""
                        }

                        $pyProc = [System.Diagnostics.Process]::Start($pyPsi)
                        $outTask = $pyProc.StandardOutput.ReadToEndAsync()
                        if ($pyProc.WaitForExit(6000)) {
                            $pyOut = $outTask.Result
                            if ($pyOut -and ($pyOut.Trim() -match '^\d+$')) {
                                $parsed = [int]$pyOut.Trim()
                                if ($parsed -ge 40 -and $parsed -le 240) {
                                    $detectedBpm = [string]$parsed
                                }
                            }
                        } else {
                            $pyProc.Kill()
                        }
                    } catch { }
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
        # Cache original timestamps to prevent metadata/COM readers from modifying them
        $origCreationTime = $f.CreationTime
        $origLastWriteTime = $f.LastWriteTime
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
        # Third priority: audio analysis (only if explicitly enabled by user)
        elseif (-not $metaBpm -and $EnableBpmAnalysis) {
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

        # Restore on-disk creation/write timestamps if any inspection tool altered them
        try {
            $fileCheck = [System.IO.FileInfo]::new($f.FullName)
            if ($fileCheck.CreationTime -ne $origCreationTime) {
                $fileCheck.CreationTime = $origCreationTime
            }
            if ($fileCheck.LastWriteTime -ne $origLastWriteTime) {
                $fileCheck.LastWriteTime = $origLastWriteTime
            }
        } catch { }

        $epochCreated = [int][double]::Parse((Get-Date $origCreationTime -UFormat %s))
        $epochModified = [int][double]::Parse((Get-Date $origLastWriteTime -UFormat %s))

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
                created = $origCreationTime.ToString("yyyy-MM-dd HH:mm:ss")
                modified = $origLastWriteTime.ToString("yyyy-MM-dd HH:mm:ss")
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
        $null = $ps.AddScript($workerScript).AddArgument($workItem).AddArgument($root).AddArgument($audioExt).AddArgument($losslessExt).AddArgument($imgExt).AddArgument($enableBpmAnalysis)

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

# Merge with existing database items if partial or incremental indexing was selected
if ($selectedMode -ne "1" -and $existingDbItems.Count -gt 0) {
    $updatedItemsMap = @{}
    foreach ($res in $results) {
        if ($res.file -and $res.file.path) {
            $updatedItemsMap[$res.file.path.ToLowerInvariant()] = $res
        }
    }

    $mergedItems = [System.Collections.Generic.List[object]]::new()
    foreach ($existingEntry in $existingDbItems) {
        $entryPath = if ($existingEntry.file -and $existingEntry.file.path) { $existingEntry.file.path.ToLowerInvariant() } else { "" }
        if ($entryPath -and $updatedItemsMap.ContainsKey($entryPath)) {
            $mergedItems.Add($updatedItemsMap[$entryPath])
            $updatedItemsMap.Remove($entryPath)
        } else {
            $mergedItems.Add($existingEntry)
        }
    }

    foreach ($newEntry in $updatedItemsMap.Values) {
        $mergedItems.Add($newEntry)
    }

    # Normalize sequential IDs
    for ($k = 0; $k -lt $mergedItems.Count; $k++) {
        $mergedItems[$k].id = $k + 1
    }
    $results = $mergedItems
}

# Creation of the root global object
$finalData = [ordered]@{
    info = [ordered]@{
        date = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
        total_tracks_versions = $results.Count
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
        # Get current spaces count, divide by 4 (PowerShell standard), or set 1
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

Write-Host "`n[SUCCESS] Database $output updated successfully!" -ForegroundColor Green
Write-Host "$($results.Count) total track versions in database ($total processed this run) in $($timer.Elapsed.TotalSeconds) seconds." -ForegroundColor Green

if ($runAuditAfter) {
    Show-MetadataAudit -Items $results -OutputRoot $root
} else {
    Write-Host ""
    $openAuditPrompt = Read-Host "Would you like to launch the Metadata Analysis & Audit now? [y/N]"
    if ($openAuditPrompt -ieq 'y') {
        Show-MetadataAudit -Items $results -OutputRoot $root
    }
}
