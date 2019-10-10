# escape=`
FROM mcr.microsoft.com/windows/servercore:10.0.17763.737
SHELL ["powershell", "-Command", "$ErrorActionPreference = 'Stop'; $ProgressPreference = 'SilentlyContinue';"]

RUN Set-ExecutionPolicy Bypass -Scope Process -Force; iex ((New-Object System.Net.WebClient).DownloadString('https://chocolatey.org/install.ps1'))

ARG VERSION="10.6.0.0"
ENV POSTGRES_HOME="C:\Program Files\PostgreSQL\10\data"
WORKDIR $POSTGRES_HOME
RUN choco install postgresql10 --version=${env:VERSION} --params '/Password:Password12!' --no-progress -y

EXPOSE 5432

COPY postgresql.conf .
COPY pg_hba.conf .
COPY entrypoint.ps1 .

CMD .\entrypoint
