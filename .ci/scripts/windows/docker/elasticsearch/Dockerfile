# escape=`
FROM mcr.microsoft.com/windows/servercore:10.0.17763.737 AS installer
SHELL ["powershell", "-Command", "$ErrorActionPreference = 'Stop'; $ProgressPreference = 'SilentlyContinue';"]

ARG ES_VERSION="6.7.2"
ENV ES_HOME="C:\elasticsearch" `
    ES_ROOT_URL="https://artifacts.elastic.co/downloads/elasticsearch/elasticsearch"

RUN Write-Host "Downloading: $env:ES_ROOT_URL-$env:ES_VERSION.zip"; `
    Invoke-WebRequest "$env:ES_ROOT_URL-$env:ES_VERSION.zip.sha512" -OutFile 'elasticsearch.zip.sha' -UseBasicParsing; `
    $env:ES_SHA = (Get-Content -Raw elasticsearch.zip.sha).Split(' ')[0]; `
    Invoke-WebRequest "$env:ES_ROOT_URL-$env:ES_VERSION.zip" -OutFile 'elasticsearch.zip' -UseBasicParsing; `
    if ((Get-FileHash elasticsearch.zip -Algorithm sha512).Hash.ToLower() -ne $env:ES_SHA) {exit 1}; `
    Expand-Archive elasticsearch.zip -DestinationPath C:\ ; `
    Move-Item c:/elasticsearch-$($env:ES_VERSION) $env:ES_HOME;

# Elasticsearch
FROM openjdk:8-windowsservercore-1809
SHELL ["powershell", "-Command", "$ErrorActionPreference = 'Stop';"]

ARG ES_VERSION="6.7.2"
ENV ES_VERSION=${ES_VERSION} `
    ES_HOME="C:\elasticsearch" `
    ES_JAVA_OPTS="-Xms512m -Xmx512m"

VOLUME C:\data
EXPOSE 9200 9300

SHELL ["cmd", "/S", "/C"]
CMD ".\bin\elasticsearch.bat"

WORKDIR $ES_HOME
COPY --from=installer C:\elasticsearch\ .
COPY elasticsearch.yml ./config/elasticsearch.yml

HEALTHCHECK --interval=5s `
 CMD powershell -command `
    try { `
     $content = (iwr -useb http://localhost:9200/_cat/health).Content; `
     $health = $content.Split(' ')[3]; `
     if ($health -eq 'green' -or $health -eq 'yellow') { return 0 } `
     else { return 1 }; `
    } catch { return 1 }
