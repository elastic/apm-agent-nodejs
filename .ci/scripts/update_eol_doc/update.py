#!/usr/bin/env python


import argparse
import lib


def parse_args():
    """
    Parse arguments given to the script

    Returns
    -------
    argparse.Namespace
        The collected args. Access each arg via properties.
    """
    parser = argparse.ArgumentParser(description="Update script for the \
        EOL table")
    parser.add_argument("--release",
                        help="The release to insert. e.g. `3.6.x`",
                        required=True)
    parser.add_argument("--doc",
                        help="The upgrade document to parse",
                        default="docs/upgrading.asciidoc",
                        required=False)
    # This is just a helper to make testing a little less painful
    parser.add_argument("--quiet",
                        help=argparse.SUPPRESS,
                        required=False,
                        default=False)
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    lib.entrypoint(args)
