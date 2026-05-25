# OFFCUT Player - 의존 바이너리 자동 다운로드
# mpv.exe + ffmpeg.exe + ffprobe.exe 를 resources/bin/ 에 배치합니다.
# 사용: npm run setup:bin

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$root = Split-Path -Parent $PSScriptRoot
$binDir = Join-Path $root 'resources\bin'
$tmpDir = Join-Path $root '.tmp-bin'

New-Item -ItemType Directory -Path $binDir -Force | Out-Null
New-Item -ItemType Directory -Path $tmpDir -Force | Out-Null

function Get-SevenZipPath {
    $cmd = Get-Command 7z -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }

    $candidates = @(
        "$env:ProgramFiles\7-Zip\7z.exe",
        "${env:ProgramFiles(x86)}\7-Zip\7z.exe",
        "$env:LOCALAPPDATA\Programs\7-Zip\7z.exe"
    )
    foreach ($p in $candidates) {
        if (Test-Path $p) { return $p }
    }
    return $null
}

function Try-InstallSevenZip {
    Write-Host "[7z] not found. Attempting winget install..."
    $winget = Get-Command winget -ErrorAction SilentlyContinue
    if (-not $winget) {
        Write-Warning "winget not available. Install 7-Zip manually: https://www.7-zip.org/"
        return $null
    }
    try {
        & winget install --id 7zip.7zip --silent --accept-package-agreements --accept-source-agreements --source winget 2>&1 | Out-Null
    } catch {
        Write-Warning "winget install failed: $_"
        return $null
    }
    Start-Sleep -Seconds 2
    $path = Get-SevenZipPath
    if ($path) {
        Write-Host "[7z] installed at $path"
        # Add to current session PATH so subsequent calls work
        $dir = Split-Path $path -Parent
        $env:PATH = "$dir;$env:PATH"
    }
    return $path
}

# ---------- ffmpeg.exe + ffprobe.exe ----------
$ffmpegOut = Join-Path $binDir 'ffmpeg.exe'
$ffprobeOut = Join-Path $binDir 'ffprobe.exe'
if ((Test-Path $ffmpegOut) -and (Test-Path $ffprobeOut)) {
    Write-Host "[skip] ffmpeg.exe + ffprobe.exe already present"
} else {
    Write-Host "[ffmpeg] downloading BtbN essentials build..."
    $ffmpegZip = Join-Path $tmpDir 'ffmpeg.zip'
    $ffmpegUrl = 'https://github.com/BtbN/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-win64-gpl.zip'
    Invoke-WebRequest -Uri $ffmpegUrl -OutFile $ffmpegZip

    Write-Host "[ffmpeg] extracting (zip — native PowerShell)..."
    $ffmpegExtract = Join-Path $tmpDir 'ffmpeg'
    if (Test-Path $ffmpegExtract) { Remove-Item -Recurse -Force $ffmpegExtract }
    Expand-Archive -Path $ffmpegZip -DestinationPath $ffmpegExtract -Force

    $foundFf = Get-ChildItem -Path $ffmpegExtract -Recurse -Filter 'ffmpeg.exe' | Select-Object -First 1
    if (-not $foundFf) { throw 'ffmpeg.exe not found in archive' }
    Copy-Item $foundFf.FullName $ffmpegOut -Force
    Write-Host "[ffmpeg] -> $ffmpegOut"

    $foundFp = Get-ChildItem -Path $ffmpegExtract -Recurse -Filter 'ffprobe.exe' | Select-Object -First 1
    if ($foundFp) {
        Copy-Item $foundFp.FullName $ffprobeOut -Force
        Write-Host "[ffprobe] -> $ffprobeOut"
    } else {
        Write-Warning "ffprobe.exe not found in archive"
    }
}

# ---------- mpv.exe ----------
$mpvOut = Join-Path $binDir 'mpv.exe'
if (Test-Path $mpvOut) {
    Write-Host "[skip] mpv.exe already present"
} else {
    $sevenZip = Get-SevenZipPath
    if (-not $sevenZip) {
        $sevenZip = Try-InstallSevenZip
    }
    if (-not $sevenZip) {
        Write-Host ""
        Write-Host "=============================================" -ForegroundColor Yellow
        Write-Host " 7-Zip 이 필요합니다 (mpv 빌드가 .7z 형식)" -ForegroundColor Yellow
        Write-Host "=============================================" -ForegroundColor Yellow
        Write-Host ""
        Write-Host " 옵션 1: winget 으로 설치 (관리자 권한 불필요)" -ForegroundColor Cyan
        Write-Host "   winget install 7zip.7zip" -ForegroundColor White
        Write-Host ""
        Write-Host " 옵션 2: 공식 인스톨러 다운로드" -ForegroundColor Cyan
        Write-Host "   https://www.7-zip.org/" -ForegroundColor White
        Write-Host ""
        Write-Host " 설치 후 PowerShell 창을 새로 열고 다시 실행:" -ForegroundColor Cyan
        Write-Host "   npm run setup:bin" -ForegroundColor White
        Write-Host ""
        exit 1
    }

    Write-Host "[mpv] using 7z at: $sevenZip"
    Write-Host "[mpv] fetching latest release info..."
    $headers = @{ 'User-Agent' = 'offcut-player-setup' }
    $rel = Invoke-RestMethod -Uri 'https://api.github.com/repos/shinchiro/mpv-winbuild-cmake/releases/latest' -Headers $headers

    $asset = $rel.assets | Where-Object { $_.name -match '^mpv-x86_64-v3-.*\.7z$' } | Select-Object -First 1
    if (-not $asset) {
        $asset = $rel.assets | Where-Object { $_.name -match '^mpv-x86_64-.*\.7z$' -and $_.name -notmatch 'dev' } | Select-Object -First 1
    }
    if (-not $asset) { throw 'No suitable mpv asset found in latest release' }

    Write-Host "[mpv] downloading $($asset.name)..."
    $mpvArchive = Join-Path $tmpDir $asset.name
    Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $mpvArchive

    Write-Host "[mpv] extracting via 7z..."
    $mpvExtract = Join-Path $tmpDir 'mpv'
    if (Test-Path $mpvExtract) { Remove-Item -Recurse -Force $mpvExtract }
    & $sevenZip x $mpvArchive "-o$mpvExtract" -y | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "7z extraction failed (exit $LASTEXITCODE)" }

    $foundMpv = Get-ChildItem -Path $mpvExtract -Recurse -Filter 'mpv.exe' | Select-Object -First 1
    if (-not $foundMpv) { throw 'mpv.exe not found in archive' }
    Copy-Item $foundMpv.FullName $mpvOut -Force
    Write-Host "[mpv] -> $mpvOut"
}

# cleanup
Remove-Item -Recurse -Force $tmpDir -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "=== resources/bin contents ===" -ForegroundColor Green
Get-ChildItem $binDir | Where-Object { $_.Name -ne '.gitkeep' } | Format-Table Name, @{Name='Size MB'; Expression={[math]::Round($_.Length / 1MB, 1)}} -AutoSize

Write-Host ""
Write-Host "셋업 완료. 'npm run dev' 로 시작하세요." -ForegroundColor Green
