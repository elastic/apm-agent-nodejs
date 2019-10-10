Write-Host "Wait a few seconds until the postgres is ready..."
sleep 5
Write-Host "Create users for remote access..."
psql -U postgres -c "CREATE ROLE jenkins WITH LOGIN SUPERUSER INHERIT CREATEDB CREATEROLE REPLICATION;"

Write-Host "Show postgres log output in the console..."
# Keep running the container with the event logs in the stdout.
Get-Content log/postgresql.log -Wait
