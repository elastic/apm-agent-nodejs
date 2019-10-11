# escape=`
FROM mcr.microsoft.com/windows/servercore:10.0.17763.737
SHELL ["powershell", "-Command", "$ErrorActionPreference = 'Stop'; $ProgressPreference = 'SilentlyContinue';"]

ARG VERSION="2.8.19"
ENV REDIS_HOME="C:\redis"
ENV ROOT_URL="https://github.com/MSOpenTech/redis/releases/download/win"
WORKDIR $REDIS_HOME

RUN Write-Host "Downloading: $env:ROOT_URL-$env:VERSION.zip"; `
    Invoke-WebRequest "$env:ROOT_URL-$env:VERSION/redis-$env:VERSION.zip" -OutFile 'redis.zip' -UseBasicParsing; `
    Expand-Archive redis.zip -DestinationPath C:\redis ;

COPY redis.conf .
EXPOSE 6379

SHELL ["cmd", "/S", "/C"]
CMD "redis-server redis.conf"
