# Abort with non zero exit code on errors
$ErrorActionPreference = "Stop"

Write-Host "Preparing to download and install Elasticsearch..." -ForegroundColor Cyan
$esVersion = "7.3.2"
$downloadUrl = "https://artifacts.elastic.co/downloads/elasticsearch/elasticsearch-$($esVersion)-windows-x86_64.zip"
$zipPath = "$($env:USERPROFILE)\elasticsearch-$esVersion.zip"
$extractRoot = "$env:SYSTEMDRIVE"
$esRoot = "$extractRoot\elasticsearch-$esVersion"
[Environment]::SetEnvironmentVariable("JAVA_HOME",$null,"User")
Write-Host "Environment..." -ForegroundColor Cyan
Get-ChildItem Env: | Sort Name | Format-Table -Wrap -AutoSize

Write-Host "Downloading Elasticsearch..."
(New-Object Net.WebClient).DownloadFile($downloadUrl, $zipPath)
7z x $zipPath -y -o"$extractRoot" | Out-Null
del $zipPath
Get-ChildItem $esRoot | where {$_.Attributes -match'Directory'}

Write-Host "Installing Elasticsearch as a Windows service..."
& "$esRoot\bin\elasticsearch-service.bat" install

Write-Host "Starting Elasticsearch service..."
& "$esRoot\bin\elasticsearch-service.bat" start

do {
  Write-Host "Waiting for Elasticsearch service to bootstrap..."
  sleep 1
} until(Test-NetConnection localhost -Port 9200 | ? { $_.TcpTestSucceeded } )

Write-Host "Elasticsearch installed" -ForegroundColor Green
