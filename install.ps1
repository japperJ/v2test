# PowerShell Script - Requires CRLF line endings and UTF-8 encoding (no BOM)
# JP Dynamic Agent System (v2) Installation Script
# Downloads essential files from GitHub to set up a new repository

param(
    [string]$TargetPath = "."
)

$ErrorActionPreference = "Stop"

# Configuration
$GitHubBase = "https://raw.githubusercontent.com/japperJ/JP-Dynamic-Agent-System--v2-/main"
$SuccessCount = 0
$FailCount = 0
$FailedFiles = @()

# Essential files to download
$FilesToDownload = @(
    # Agents
    ".github/agents/orchestrator.agent.md",
    ".github/agents/researcher.agent.md",
    ".github/agents/planner.agent.md",
    ".github/agents/coder.agent.md",
    ".github/agents/verifier.agent.md",
    ".github/agents/debugger.agent.md",
    ".github/agents/designer.agent.md",
    
    # Skills
    ".github/skills/extension-coordinator/SKILL.md",
    ".github/skills/extension-verifier/SKILL.md",
    
    # Extension Planning
    ".planning/extensions/EDR_TEMPLATE.md",
    ".planning/extensions/REGISTRY.yaml",
    ".planning/extensions/DECISION_RULES.md",
    ".planning/extensions/WIRING_CONTRACT.md",
    ".planning/extensions/ADDITIVE_ONLY.md",
    
    # Baseline
    ".planning/baseline/P0_INVARIANTS.yaml",
    ".planning/baseline/CHANGE_GATES.md",
    ".planning/baseline/TOOL_FALLBACKS.md"
)

Write-Host "`n╔══════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  JP Dynamic Agent System (v2) - Installation Script          ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

Write-Host "Target Directory: " -NoNewline
Write-Host "$((Resolve-Path $TargetPath).Path)" -ForegroundColor Yellow
Write-Host "Files to Download: " -NoNewline
Write-Host "$($FilesToDownload.Count)" -ForegroundColor Yellow
Write-Host ""

# Create base directory if needed
if (-not (Test-Path $TargetPath)) {
    New-Item -ItemType Directory -Force -Path $TargetPath | Out-Null
}

Set-Location $TargetPath

# Download each file
foreach ($file in $FilesToDownload) {
    $relPath = $file.Replace("/", "\")
    $url = "$GitHubBase/$file"
    
    Write-Host "Downloading: " -NoNewline
    Write-Host "$file" -ForegroundColor Cyan -NoNewline
    Write-Host " ... " -NoNewline
    
    # Create directory if it doesn't exist
    $dir = Split-Path -Parent $relPath
    if ($dir -and -not (Test-Path $dir)) {
        New-Item -ItemType Directory -Force -Path $dir | Out-Null
    }
    
    try {
        Invoke-WebRequest -Uri $url -OutFile $relPath -ErrorAction Stop
        Write-Host "✓" -ForegroundColor Green
        $SuccessCount++
    }
    catch {
        if ($_.Exception.Response.StatusCode -eq 404) {
            Write-Host "✗ (404 Not Found)" -ForegroundColor Red
        }
        else {
            Write-Host "✗ ($($_.Exception.Message))" -ForegroundColor Red
        }
        $FailCount++
        $FailedFiles += $file
    }
}

# Summary
Write-Host "`n╔══════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  Installation Summary                                        ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

Write-Host "Successfully downloaded: " -NoNewline
Write-Host "$SuccessCount" -ForegroundColor Green -NoNewline
Write-Host " / $($FilesToDownload.Count) files"

if ($FailCount -gt 0) {
    Write-Host "Failed to download: " -NoNewline
    Write-Host "$FailCount" -ForegroundColor Red -NoNewline
    Write-Host " files"
    Write-Host "`nFailed files:" -ForegroundColor Yellow
    foreach ($failedFile in $FailedFiles) {
        Write-Host "  - $failedFile" -ForegroundColor Red
    }
}

Write-Host ""

if ($SuccessCount -eq $FilesToDownload.Count) {
    Write-Host "✓ Installation complete! " -ForegroundColor Green -NoNewline
    Write-Host "All essential framework files downloaded successfully." -ForegroundColor White
    Write-Host "`nNext steps:" -ForegroundColor Cyan
    Write-Host "  1. Start a new project by invoking the Orchestrator agent" -ForegroundColor White
    Write-Host "  2. The agent will create project-specific .planning files as needed" -ForegroundColor White
    Write-Host "  3. Customize .github/agents/*.agent.md for your workflow preferences" -ForegroundColor White
}
elseif ($SuccessCount -gt 0) {
    Write-Host "⚠ Partial installation completed." -ForegroundColor Yellow
    Write-Host "Some files failed to download. Please check the errors above." -ForegroundColor Yellow
}
else {
    Write-Host "✗ Installation failed!" -ForegroundColor Red
    Write-Host "No files were downloaded. Please check your internet connection and try again." -ForegroundColor Red
}

# Pause to prevent terminal from closing
Write-Host "`nPress any key to close..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")