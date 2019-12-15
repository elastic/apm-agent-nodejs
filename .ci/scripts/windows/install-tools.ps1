# Abort with non zero exit code on errors
$ErrorActionPreference = "Stop"

Write-Host "List environment variables ..."
Get-ChildItem Env: | Sort Name | Format-Table -Wrap -AutoSize

Write-Host("Getting latest Nodejs version for {0} ..." -f $env:VERSION)
choco list nodejs --by-id-only --all | Select-String -Pattern "nodejs $env:VERSION"
$Version = $(choco list nodejs --by-id-only --all) | Select-String -Pattern "nodejs $env:VERSION" | %{$_.ToString().split(" ")[1]} | sort {[version] $_} | Select-Object -Last 1

Write-Host("Installing Nodejs {0} ..." -f $Version)
& choco install nodejs --no-progress -y --version "$Version"
