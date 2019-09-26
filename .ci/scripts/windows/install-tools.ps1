# Abort with non zero exit code on errors
$ErrorActionPreference = "Stop"

Get-ChildItem Env: | Sort Name | Format-Table -Wrap -AutoSize

Write-Host "Installing Nodejs..."
& choco install nodejs --no-progress -y --version "$env:VERSION"

Write-Host "Installing docker-compose..."
choco install docker-compose --no-progress -y

& refreshenv
Get-ChildItem Env: | Sort Name | Format-Table -Wrap -AutoSize
