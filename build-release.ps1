<#
.SYNOPSIS
    Build release installers for Pelagic with automatic version bumping.

.DESCRIPTION
    This script reads the current version from tauri.conf.json, increments it,
    updates all version files, and builds installers for Windows, Mac, and Linux.

.PARAMETER Major
    Bump the major version (X.0.0) instead of minor version.

.PARAMETER Minor
    Bump the minor version (0.X.0). This is the default.

.PARAMETER Patch
    Bump the patch version (0.0.X).

.PARAMETER SkipBump
    Skip version bumping and build with current version.

.PARAMETER Platform
    Build only for specific platform: 'windows', 'mac', 'linux', or 'all' (default).

.EXAMPLE
    .\build-release.ps1
    # Bumps patch version and builds for all platforms

.EXAMPLE
    .\build-release.ps1 -Minor
    # Bumps minor version and builds for all platforms

.EXAMPLE
    .\build-release.ps1 -Major
    # Bumps major version and builds for all platforms

.EXAMPLE
    .\build-release.ps1 -SkipBump -Platform windows
    # Builds Windows installer without version bump
#>

param(
    [switch]$Major,
    [switch]$Minor,
    [switch]$Patch,
    [switch]$SkipBump,
    [ValidateSet('windows', 'mac', 'linux', 'all')]
    [string]$Platform = 'all'
)

$ErrorActionPreference = "Stop"

# File paths
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$TauriConfigPath = Join-Path $ScriptDir "src-tauri\tauri.conf.json"
$PackageJsonPath = Join-Path $ScriptDir "package.json"
$CargoTomlPath = Join-Path $ScriptDir "src-tauri\Cargo.toml"

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Pelagic Release Builder" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Function to parse version string
function Parse-Version {
    param([string]$VersionString)
    
    if ($VersionString -match '^(\d+)\.(\d+)\.(\d+)$') {
        return @{
            Major = [int]$Matches[1]
            Minor = [int]$Matches[2]
            Patch = [int]$Matches[3]
        }
    }
    throw "Invalid version format: $VersionString"
}

# Function to format version
function Format-Version {
    param($Version)
    return "$($Version.Major).$($Version.Minor).$($Version.Patch)"
}

# Read current version from tauri.conf.json
Write-Host "Reading current version..." -ForegroundColor Yellow

$TauriConfig = Get-Content $TauriConfigPath -Raw | ConvertFrom-Json
$CurrentVersion = $TauriConfig.version
$ParsedVersion = Parse-Version $CurrentVersion

Write-Host "  Current version: $CurrentVersion" -ForegroundColor White

# Calculate new version
if (-not $SkipBump) {
    $NewVersion = @{
        Major = $ParsedVersion.Major
        Minor = $ParsedVersion.Minor
        Patch = $ParsedVersion.Patch
    }
    
    if ($Major) {
        $NewVersion.Major++
        $NewVersion.Minor = 0
        $NewVersion.Patch = 0
        Write-Host "  Bumping MAJOR version" -ForegroundColor Magenta
    }
    elseif ($Minor) {
        $NewVersion.Minor++
        $NewVersion.Patch = 0
        Write-Host "  Bumping MINOR version" -ForegroundColor Magenta
    }
    else {
        # Default to patch
        $NewVersion.Patch++
        Write-Host "  Bumping PATCH version" -ForegroundColor Magenta
    }
    
    $NewVersionString = Format-Version $NewVersion
    Write-Host "  New version: $NewVersionString" -ForegroundColor Green
    Write-Host ""
    
    # Confirm with user
    $Confirm = Read-Host "Proceed with version $NewVersionString? (Y/n)"
    if ($Confirm -eq 'n' -or $Confirm -eq 'N') {
        Write-Host "Aborted." -ForegroundColor Red
        exit 1
    }
    
    # Update tauri.conf.json
    Write-Host "Updating tauri.conf.json..." -ForegroundColor Yellow
    $TauriConfigContent = Get-Content $TauriConfigPath -Raw
    $TauriConfigContent = $TauriConfigContent -replace '"version":\s*"[^"]*"', "`"version`": `"$NewVersionString`""
    Set-Content -Path $TauriConfigPath -Value $TauriConfigContent -NoNewline
    Write-Host "  Updated tauri.conf.json" -ForegroundColor Green
    
    # Update package.json
    Write-Host "Updating package.json..." -ForegroundColor Yellow
    $PackageJsonContent = Get-Content $PackageJsonPath -Raw
    $PackageJsonContent = $PackageJsonContent -replace '"version":\s*"[^"]*"', "`"version`": `"$NewVersionString`""
    Set-Content -Path $PackageJsonPath -Value $PackageJsonContent -NoNewline
    Write-Host "  Updated package.json" -ForegroundColor Green
    
    # Update Cargo.toml (version is in [package] section)
    Write-Host "Updating Cargo.toml..." -ForegroundColor Yellow
    $CargoContent = Get-Content $CargoTomlPath -Raw
    # Match version line that appears after [package] and before the next section
    $CargoContent = $CargoContent -replace '(^\[package\][\s\S]*?^version\s*=\s*")[^"]*(")', "`$1$NewVersionString`$2"
    Set-Content -Path $CargoTomlPath -Value $CargoContent -NoNewline
    Write-Host "  Updated Cargo.toml" -ForegroundColor Green
    
    $BuildVersion = $NewVersionString
}
else {
    Write-Host "  Skipping version bump" -ForegroundColor Yellow
    $BuildVersion = $CurrentVersion
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Building version $BuildVersion" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Ensure we're in the right directory
Set-Location $ScriptDir

# Install dependencies if needed
Write-Host "Checking npm dependencies..." -ForegroundColor Yellow
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to install npm dependencies" -ForegroundColor Red
    exit 1
}

# Build based on platform
$BuildArgs = @("tauri", "build")

switch ($Platform) {
    'windows' {
        Write-Host "Building for Windows..." -ForegroundColor Yellow
        $BuildArgs += "--target", "x86_64-pc-windows-msvc"
    }
    'mac' {
        Write-Host "Building for macOS..." -ForegroundColor Yellow
        # For Mac, you'd typically need to be on a Mac or use cross-compilation
        $BuildArgs += "--target", "x86_64-apple-darwin"
        $BuildArgs += "--target", "aarch64-apple-darwin"
    }
    'linux' {
        Write-Host "Building for Linux..." -ForegroundColor Yellow
        $BuildArgs += "--target", "x86_64-unknown-linux-gnu"
    }
    'all' {
        Write-Host "Building for current platform..." -ForegroundColor Yellow
        # When building 'all', just build for the current platform
        # Cross-compilation requires specific setup
    }
}

# Run the build
Write-Host ""
Write-Host "Running: npm run $($BuildArgs -join ' ')" -ForegroundColor Cyan
& npm run @BuildArgs

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "Build failed!" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  Build Complete!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "Version: $BuildVersion" -ForegroundColor White
Write-Host ""
Write-Host "Installers can be found in:" -ForegroundColor Yellow
Write-Host "  src-tauri\target\release\bundle\" -ForegroundColor White
Write-Host ""

# List the built files
$BundlePath = Join-Path $ScriptDir "src-tauri\target\release\bundle"
if (Test-Path $BundlePath) {
    Write-Host "Built artifacts:" -ForegroundColor Yellow
    Get-ChildItem -Path $BundlePath -Recurse -File | ForEach-Object {
        $RelPath = $_.FullName.Replace($BundlePath, "").TrimStart("\")
        $Size = "{0:N2} MB" -f ($_.Length / 1MB)
        Write-Host "  $RelPath ($Size)" -ForegroundColor White
    }
}

Write-Host ""
Write-Host "Done!" -ForegroundColor Green
