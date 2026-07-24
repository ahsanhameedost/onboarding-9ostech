[CmdletBinding()]
param(
    [switch]$SkipChecks
)

Set-StrictMode -Version 3.0
$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent $PSScriptRoot
$VersionFile = Join-Path $RepoRoot '.nvmrc'
$PackageFile = Join-Path $RepoRoot 'package.json'

if (-not (Test-Path -LiteralPath $VersionFile -PathType Leaf)) {
    throw "Missing Node.js version file: $VersionFile"
}
if (-not (Test-Path -LiteralPath $PackageFile -PathType Leaf)) {
    throw "Missing package manifest: $PackageFile"
}

$NodeVersion = (Get-Content -LiteralPath $VersionFile -Raw).Trim()
if ($NodeVersion -notmatch '^\d+\.\d+\.\d+$') {
    throw "Invalid Node.js version in .nvmrc: $NodeVersion"
}

$Package = Get-Content -LiteralPath $PackageFile -Raw | ConvertFrom-Json
$RequiredNpmVersion = ([string]$Package.packageManager -split '@')[-1]
$NodeFolderName = "node-v$NodeVersion-win-x64"
$InstallParent = Join-Path $env:LOCALAPPDATA 'Programs\OakBoard'
$InstallRoot = Join-Path $InstallParent $NodeFolderName
$NodeExe = Join-Path $InstallRoot 'node.exe'
$NpmCmd = Join-Path $InstallRoot 'npm.cmd'

function Invoke-ExternalCommand {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter(Mandatory = $true)][string[]]$ArgumentList
    )

    & $FilePath @ArgumentList
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed with exit code ${LASTEXITCODE}: $FilePath $($ArgumentList -join ' ')"
    }
}

if (-not (Test-Path -LiteralPath $NodeExe -PathType Leaf)) {
    Write-Host "Installing Node.js $NodeVersion without administrator access..." -ForegroundColor Cyan
    $TempRoot = Join-Path ([IO.Path]::GetTempPath()) ("oakboard-node-" + [Guid]::NewGuid().ToString('N'))
    $ArchiveName = "$NodeFolderName.zip"
    $ArchivePath = Join-Path $TempRoot $ArchiveName
    $ChecksumsPath = Join-Path $TempRoot 'SHASUMS256.txt'
    $ExtractRoot = Join-Path $TempRoot 'extract'
    $BaseUrl = "https://nodejs.org/dist/v$NodeVersion"

    try {
        New-Item -ItemType Directory -Path $TempRoot -Force | Out-Null
        $Curl = Get-Command 'curl.exe' -ErrorAction Stop
        Invoke-ExternalCommand -FilePath $Curl.Source -ArgumentList @('-fL', '--retry', '3', "$BaseUrl/$ArchiveName", '-o', $ArchivePath)
        Invoke-ExternalCommand -FilePath $Curl.Source -ArgumentList @('-fL', '--retry', '3', "$BaseUrl/SHASUMS256.txt", '-o', $ChecksumsPath)

        $ExpectedLine = Get-Content -LiteralPath $ChecksumsPath |
            Where-Object { $_ -match [regex]::Escape($ArchiveName) } |
            Select-Object -First 1
        if (-not $ExpectedLine) {
            throw "Official checksum entry not found for $ArchiveName"
        }

        $ExpectedHash = (($ExpectedLine.Trim() -split '\s+')[0]).ToUpperInvariant()
        $ActualHash = (Get-FileHash -LiteralPath $ArchivePath -Algorithm SHA256).Hash
        if ($ActualHash -ne $ExpectedHash) {
            throw "Node.js archive checksum mismatch. Expected $ExpectedHash, received $ActualHash"
        }

        Expand-Archive -LiteralPath $ArchivePath -DestinationPath $ExtractRoot -Force
        $ExtractedRoot = Join-Path $ExtractRoot $NodeFolderName
        if (-not (Test-Path -LiteralPath (Join-Path $ExtractedRoot 'node.exe') -PathType Leaf)) {
            throw 'The extracted Node.js archive does not contain node.exe.'
        }

        New-Item -ItemType Directory -Path $InstallParent -Force | Out-Null
        Copy-Item -LiteralPath $ExtractedRoot -Destination $InstallRoot -Recurse
    }
    finally {
        if (Test-Path -LiteralPath $TempRoot) {
            Remove-Item -LiteralPath $TempRoot -Recurse -Force
        }
    }
}

if (-not (Test-Path -LiteralPath $NpmCmd -PathType Leaf)) {
    throw "npm was not found beside the portable Node.js installation: $NpmCmd"
}

$UserPath = [Environment]::GetEnvironmentVariable('Path', 'User')
$UserPathEntries = @($UserPath -split ';' | Where-Object { $_ -and $_ -ne $InstallRoot })
[Environment]::SetEnvironmentVariable('Path', (($InstallRoot + ';' + ($UserPathEntries -join ';')).TrimEnd(';')), 'User')
$env:Path = "$InstallRoot;$env:Path"

$InstalledNodeVersion = (& $NodeExe --version).TrimStart('v')
$InstalledNpmVersion = (& $NpmCmd --version).Trim()
if ($InstalledNodeVersion -ne $NodeVersion) {
    throw "Expected Node.js $NodeVersion but found $InstalledNodeVersion"
}
if ($InstalledNpmVersion -ne $RequiredNpmVersion) {
    throw "Expected npm $RequiredNpmVersion but found $InstalledNpmVersion"
}

Write-Host "Node.js $InstalledNodeVersion and npm $InstalledNpmVersion are ready." -ForegroundColor Green

Push-Location $RepoRoot
try {
    Invoke-ExternalCommand -FilePath $NpmCmd -ArgumentList @('ci')
    if (-not $SkipChecks) {
        Invoke-ExternalCommand -FilePath $NpmCmd -ArgumentList @('run', 'build')
        Invoke-ExternalCommand -FilePath $NpmCmd -ArgumentList @('run', 'lint')
    }
}
finally {
    Pop-Location
}

Write-Host 'OakBoard setup completed successfully.' -ForegroundColor Green
Write-Host 'Create .env.local from .env.example before starting the app.' -ForegroundColor Yellow
