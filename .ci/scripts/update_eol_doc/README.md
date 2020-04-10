# EOL updater

This application updates the EOL documentation automatically.

## Prerequisites

Any supported version of Python is all that is required.

## Quickstart

To generate a Docker container that can run the application:

```
docker build . -t eol_updater
```

To run the containerized application:

```
docker run -t eol_updater --release 4.0.0
```

All output will be directed to standard out. If you wish to write to a file, use standard redirection.

## Contributing

To run the tests, use `pytest`.