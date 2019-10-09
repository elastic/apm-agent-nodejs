# escape=`
FROM mcr.microsoft.com/windows/servercore:10.0.17763.737
SHELL ["powershell", "-Command", "$ErrorActionPreference = 'Stop'; $ProgressPreference = 'SilentlyContinue';"]

RUN Set-ExecutionPolicy Bypass -Scope Process -Force; iex ((New-Object System.Net.WebClient).DownloadString('https://chocolatey.org/install.ps1'))

ARG VERSION="8.0.17"
ENV MYSQL_HOME="C:\tools\mysql\current"
RUN choco install mysql --version=${env:VERSION} --no-progress -y

EXPOSE 3306
WORKDIR $MYSQL_HOME
COPY my.ini .

HEALTHCHECK CMD [ "mysql", "-h", "127.0.0.1", "-P", "3306", "-u", "root", "-e", "SELECT 1"]

# Keep running the container with the event logs in the stdout.
CMD ["powershell", "Get-Content", "C:\\mysql.log", "-Wait"]
