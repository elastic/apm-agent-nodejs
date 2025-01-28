This dir holds a self-signed TLS certificate (and key) to be used from some
HTTPS tests.

They were generated via the same method as Go's builtin test certificate/key
pair, using https://github.com/golang/go/blob/master/src/crypto/tls/generate_cert.go:

//
//     go run generate_cert.go --rsa-bits 1024 --host 127.0.0.1,::1,localhost \
//                             --ca --start-date "Jan 1 00:00:00 1970" \
//                             --duration=1000000h
//
// The certificate is valid for 127.0.0.1, ::1, and localhost; and expires in the year 2084.
