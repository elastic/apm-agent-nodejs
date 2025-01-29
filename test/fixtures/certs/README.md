This dir holds a self-signed TLS certificate (and key) to be used from some
HTTPS tests.

They were generated via the same method as Go's builtin test certificate/key
pair, using https://github.com/golang/go/blob/master/src/crypto/tls/generate_cert.go.
Use "./regenerate.sh" to regenerate the TLS cert if necessary.
