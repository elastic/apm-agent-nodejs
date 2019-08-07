# Abort with non zero exit code on errors
$ErrorActionPreference = "Stop"

$memcachedVersion = "1.4.4-14"
$filename = "memcached-win64-$memcachedVersion.zip"
$downloadUrl = "http://downloads.northscale.com/$filename"
$zipPath = "$($env:USERPROFILE)\$filename"
$memcachedRoot = "$env:SYSTEMDRIVE\Memcached"
$memcached = "$memcachedRoot\memcached\memcached.exe"

Write-Host "Downloading Memcached..." -ForegroundColor Cyan
appveyor DownloadFile $downloadUrl -FileName $zipPath

Write-Host "Extracting Memcached..."
7z x $zipPath -y -o"$memcachedRoot" | Out-Null
del $zipPath

Write-Host "Installing Memcached as a Windows service..."
& $memcached -d install

Write-Host "Starting Memcached service..."
& $memcached -d start

Write-Host "Memcached installed" -ForegroundColor Green
