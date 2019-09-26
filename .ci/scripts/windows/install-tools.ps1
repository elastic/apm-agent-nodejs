# Abort with non zero exit code on errors
$ErrorActionPreference = "Stop"

Write-Host "Installing Nodejs..."
& choco install nodejs --no-progress -y --version %VERSION%

Write-Host "Installing Docker..."
& choco install docker-desktop --no-progress -y

Get-ChildItem Env: | Sort Name | Format-Table -Wrap -AutoSize
& refreshenv
Get-ChildItem Env: | Sort Name | Format-Table -Wrap -AutoSize
