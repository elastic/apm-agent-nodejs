#!/usr/bin/env sh
#
# Regenerate the certificate files that are used for tests using TLS.
# The certificate is valid for 127.0.0.1, ::1, and localhost; and expires in the year 2084.

curl -O https://raw.githubusercontent.com/golang/go/refs/heads/master/src/crypto/tls/generate_cert.go
go run generate_cert.go --rsa-bits 2048 --host 127.0.0.1,::1,localhost \
                        --ca --start-date "Jan 1 00:00:00 1970" \
                        --duration=1000000h
