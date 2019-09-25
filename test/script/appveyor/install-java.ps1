# Abort with non zero exit code on errors
$ErrorActionPreference = "Stop"

Write-Host "Installing java..."
& choco install jdk8 -y --no-progress -r --version 8.0.211
