<#
.SYNOPSIS
    Build release installers for Pelagic with automatic version bumping.

.DESCRIPTION
    This script reads the current version from tauri.conf.json, increments it,
    updates all version files, and builds installers for Windows, Mac, and Linux.
    Optionally commits, tags, and pushes the release to GitHub.

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

.PARAMETER Push
    After a successful build, commit version bump changes, create a git tag (vX.Y.Z),
    push both the commit and tag to the remote, and upload the installer to a GitHub release.
    This is the full release flow.

.PARAMETER Upload
    Upload the built installer to a GitHub release for the current version tag (vX.Y.Z).
    Does NOT commit, tag, or push. Useful for re-uploading an installer without changing git state.

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

.EXAMPLE
    .\build-release.ps1 -Push
    # Bumps patch, builds, commits, tags, pushes, and uploads installer to GitHub release

.EXAMPLE
    .\build-release.ps1 -Upload
    # Builds and uploads installer to GitHub release for current version (no git changes)

.EXAMPLE
    .\build-release.ps1 -Upload -SkipBump
    # Skips version bump, builds, and uploads installer to current tag
#>

param(
    [switch]$Major,
    [switch]$Minor,
    [switch]$Patch,
    [switch]$SkipBump,
    [switch]$Push,
    [switch]$Upload,
    [ValidateSet('windows', 'mac', 'linux', 'all')]
    [string]$Platform = 'all'
)

$ErrorActionPreference = "Stop"

# Ensure MinGW gcc is on PATH for x86_64-pc-windows-gnu Rust target
if (Test-Path "C:\msys64\mingw64\bin") {
    $env:PATH = "C:\msys64\mingw64\bin;$env:PATH"
    Write-Host "Added MinGW to PATH" -ForegroundColor Gray
}

# Load Tauri updater signing key (passed inline to build process, not persisted in session)
$SigningKeyPath = Join-Path $HOME ".tauri\pelagic.key"
$SigningKeyContent = $null
$SigningKeyPassword = "pelagic"
if (Test-Path $SigningKeyPath) {
    $SigningKeyContent = (Get-Content $SigningKeyPath -Raw).Trim()
    Write-Host "Found updater signing key at $SigningKeyPath" -ForegroundColor Gray
}

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

# Upload-only mode: skip build entirely and jump to upload
if ($Upload -and -not $Push) {
    $BuildVersion = $CurrentVersion
    $BundlePath = Join-Path $ScriptDir "src-tauri\target\release\bundle"
    $TagName = "v$BuildVersion"
    Write-Host "  Upload-only mode: skipping build, uploading existing installer for $TagName" -ForegroundColor Yellow
}
else {

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

# Run the build (pass signing key to child process only, not persisted in session)
Write-Host ""
# Run the build — set signing vars, run build, then clean up (vars don't leak to outer session)
Write-Host ""
Write-Host "Running: npm run $($BuildArgs -join ' ')" -ForegroundColor Cyan
try {
    $env:TAURI_SIGNING_PRIVATE_KEY = $SigningKeyContent
    $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = $SigningKeyPassword
    & npm run @BuildArgs
}
finally {
    Remove-Item Env:\TAURI_SIGNING_PRIVATE_KEY -ErrorAction SilentlyContinue
    Remove-Item Env:\TAURI_SIGNING_PRIVATE_KEY_PASSWORD -ErrorAction SilentlyContinue
}

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

} # end of build block (skipped in upload-only mode)

# Git tag and push if requested
if ($Push) {
    Write-Host ""
    Write-Host "============================================" -ForegroundColor Cyan
    Write-Host "  Git Tag & Push" -ForegroundColor Cyan
    Write-Host "============================================" -ForegroundColor Cyan
    Write-Host ""
    
    # Check if git is available
    if (-not (Get-Command "git" -ErrorAction SilentlyContinue)) {
        Write-Host "Error: git is not installed or not on PATH." -ForegroundColor Red
        exit 1
    }
    
    $TagName = "v$BuildVersion"
    
    # Check for uncommitted changes and commit version bump files
    $GitStatus = git status --porcelain 2>&1
    if ($GitStatus) {
        Write-Host "Committing changes..." -ForegroundColor Yellow
        git add -A
        if ($LASTEXITCODE -ne 0) {
            Write-Host "Error: git add failed." -ForegroundColor Red
            exit 1
        }
        
        git commit -m "Release $TagName"
        if ($LASTEXITCODE -ne 0) {
            Write-Host "Error: git commit failed." -ForegroundColor Red
            exit 1
        }
        Write-Host "  Committed: Release $TagName" -ForegroundColor Green
    }
    else {
        Write-Host "  No uncommitted changes, skipping commit." -ForegroundColor Gray
    }
    
    # Check if tag already exists locally
    $ExistingTag = git tag -l $TagName 2>&1
    if ($ExistingTag) {
        Write-Host "  Tag $TagName already exists locally. Deleting and re-creating..." -ForegroundColor Yellow
        git tag -d $TagName | Out-Null
        
        # Also delete remote tag if it exists
        git push origin --delete $TagName 2>$null | Out-Null
    }
    
    # Create annotated tag
    git tag -a $TagName -m "Pelagic $TagName"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Error: Failed to create git tag $TagName" -ForegroundColor Red
        exit 1
    }
    Write-Host "  Created tag: $TagName" -ForegroundColor Green
    
    # Push commit and tag
    Write-Host "Pushing to remote..." -ForegroundColor Yellow
    git push
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Error: git push failed." -ForegroundColor Red
        exit 1
    }
    
    git push origin $TagName
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Error: Failed to push tag $TagName" -ForegroundColor Red
        exit 1
    }
    
    Write-Host "  Pushed commit and tag $TagName to remote" -ForegroundColor Green
    Write-Host ""
    Write-Host "  To revert to this release later:" -ForegroundColor Gray
    Write-Host "    git checkout $TagName" -ForegroundColor White
    Write-Host "  To reset branch to this release:" -ForegroundColor Gray
    Write-Host "    git reset --hard $TagName" -ForegroundColor White
}

# Upload installer to GitHub Release (-Push includes this, -Upload is standalone)
if ($Push -or $Upload) {
    Write-Host ""
    Write-Host "============================================" -ForegroundColor Cyan
    Write-Host "  Uploading to GitHub Release" -ForegroundColor Cyan
    Write-Host "============================================" -ForegroundColor Cyan
    Write-Host ""
    
    # Check if gh CLI is installed
    if (-not (Get-Command "gh" -ErrorAction SilentlyContinue)) {
        Write-Host "Error: GitHub CLI (gh) is not installed." -ForegroundColor Red
        Write-Host "Install from: https://cli.github.com/" -ForegroundColor Yellow
        exit 1
    }
    
    # Check if authenticated
    $AuthStatus = gh auth status 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Error: Not authenticated with GitHub CLI." -ForegroundColor Red
        Write-Host "Run: gh auth login" -ForegroundColor Yellow
        exit 1
    }
    
    # Set TagName if not already set by -Push block
    if (-not $TagName) { $TagName = "v$BuildVersion" }
    $ReleaseName = "Pelagic $TagName"
    
    # Find the NSIS installer
    $NsisPath = Join-Path $BundlePath "nsis"
    $InstallerFile = Get-ChildItem -Path $NsisPath -Filter "*-setup.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
    
    if (-not $InstallerFile) {
        Write-Host "Error: No NSIS installer found in $NsisPath" -ForegroundColor Red
        exit 1
    }
    
    Write-Host "Installer: $($InstallerFile.Name)" -ForegroundColor White
    Write-Host "Tag: $TagName" -ForegroundColor White
    Write-Host ""
    
    # Check if release already exists
    $ErrorActionPreference = "SilentlyContinue"
    gh release view $TagName 2>$null | Out-Null
    $ReleaseExists = $LASTEXITCODE -eq 0
    $ErrorActionPreference = "Stop"
    
    if ($ReleaseExists) {
        Write-Host "Release $TagName already exists. Uploading asset..." -ForegroundColor Yellow
        gh release upload $TagName $InstallerFile.FullName --clobber
    }
    else {
        Write-Host "Creating new release $TagName..." -ForegroundColor Yellow
        gh release create $TagName $InstallerFile.FullName --title $ReleaseName --generate-notes
    }
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "Successfully uploaded to GitHub release!" -ForegroundColor Green
        Write-Host "View at: https://github.com/wyvernp/pelagic/releases/tag/$TagName" -ForegroundColor Cyan
    }
    else {
        Write-Host "Failed to upload to GitHub release" -ForegroundColor Red
        exit 1
    }

    # Upload NSIS signature file for Tauri updater
    $SigFile = Get-ChildItem -Path $NsisPath -Filter "*-setup.exe.sig" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($SigFile) {
        Write-Host ""
        Write-Host "Uploading updater signature: $($SigFile.Name)" -ForegroundColor Yellow
        gh release upload $TagName $SigFile.FullName --clobber
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  Signature uploaded" -ForegroundColor Green
        }
    }

    # Generate and upload latest.json for Tauri auto-updater
    if ($SigFile) {
        Write-Host ""
        Write-Host "Generating latest.json for Tauri updater..." -ForegroundColor Yellow
        $SigContent = (Get-Content $SigFile.FullName -Raw).Trim()
        $InstallerUrl = "https://github.com/wyvernp/pelagic/releases/download/$TagName/$($InstallerFile.Name)"
        $PubDate = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
        $LatestJson = @{
            version = $BuildVersion
            notes = "Pelagic $TagName"
            pub_date = $PubDate
            platforms = @{
                "windows-x86_64" = @{
                    signature = $SigContent
                    url = $InstallerUrl
                }
            }
        } | ConvertTo-Json -Depth 5

        $LatestJsonPath = Join-Path $BundlePath "latest.json"
        Set-Content -Path $LatestJsonPath -Value $LatestJson
        Write-Host "  Uploading latest.json..." -ForegroundColor Yellow
        gh release upload $TagName $LatestJsonPath --clobber
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  Updater manifest uploaded!" -ForegroundColor Green
        }
        else {
            Write-Host "  Warning: Failed to upload latest.json" -ForegroundColor Yellow
        }
    }
    else {
        Write-Host ""
        Write-Host "  No .exe.sig found - skipping updater manifest." -ForegroundColor Yellow
        Write-Host "  Set TAURI_SIGNING_PRIVATE_KEY env var before building to enable update signing." -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "Done!" -ForegroundColor Green
