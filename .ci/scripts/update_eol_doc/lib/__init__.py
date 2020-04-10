#!/usr/bin/env python
import os
import re
import datetime


def _project_root():
    """
    Find the root directory of the project

    Returns
    -------
    str
        The root directory
    """
    this_file = os.path.dirname(os.path.realpath(__file__))
    relative_root = "../../../../"
    return os.path.join(this_file, relative_root)


def split_file_by_lines(args):
    """
    Split the documentation file into a list with one line per element

    Returns
    -------
    list
        The file, with one element per line
    """
    if args.doc == "docs/upgrading.asciidoc":
        doc_path = os.path.join(_project_root(), args.doc)
    else:
        doc_path = args.doc
    with open(doc_path, "r") as fh_:
        split_file = fh_.readlines()
    return split_file


def find_header_marker(lines):
    """
    Locate the position where the table is located in an array of file lines.

    Parameters
    ----------
    lines : list, required
        The lines of the file split into an array.

    Returns
    -------
    int
        The index position in the array where the marker is located. Zero-based
        counting.

    Raises
    ------
    Exception
        If the marker cannot be located then an exception is raised.
    """
    for index, line in enumerate(lines):
        if re.match(r"\|Agent version \|EOL Date \|Maintained until", line):
            return index + 1
    raise Exception("No table marker could be located")


def _last_minor_line(lines, current_version):
    major, minor, bugfix = current_version.split('.')
    previous_major_num = str(int(major) - 1)
    previous_major = r"\|{}".format(previous_major_num)
    for index, line in enumerate(lines):
        if re.match("{previous_major}".format(
                previous_major=previous_major), line):
            return (index, line)
    raise Exception("No table marker could be located")


def find_last_minor_marker(lines, current_version):
    """
    Locate the position of where the last release is located in an array of
    file lines.

    Parameters
    ----------
    lines : list, required
        The lines of the file split into an array.

    current_version : str, required
        The current version, e.g. "3.1.9"

    Returns
    -------
    int
        The index position in the array where the marker is located. Zero-based
        counting.

    Raises
    ------
    Exception
        If the marker cannot be located then an exception is raised.
    """
    idx, _ = _last_minor_line(lines, current_version)
    return idx


def last_minor_version(lines, current_version):
    """
    Locate the version of the previous minor release.

    Parameters
    ----------
    lines : list, required
        The lines of the file split into an array.

    current_version : str, required
        The current version, e.g. "3.1.9"

    Returns
    -------
    str
        The version of the previous minor release.

    Raises
    ------
    Exception
        If the marker cannot be located then an exception is raised.
    """
    _, line = _last_minor_line(lines, current_version)
    return line.split("|")[1].strip()


def generate_eol_entry(release, next_major=False):
    """
    Generate a single line which represents the new release entry.

    The EOL date will be set to 18 months from today's date.

    Parameters
    ----------
    release : str, required
        The release version

    next_major : bool
        If set, the "Maintained Until" column will be set to the next major
        version.

    Returns
    -------
    str
        A string suitable for entry into a Markdown table that describes
        the current release.
    """
    ymd_format = '%Y-%m-%d'
    today_timestamp = datetime.datetime.today()
    # EOL date is 18 months from today
    eol_date = (today_timestamp + datetime.timedelta(days=540)).strftime(
        ymd_format)
    major, minor, bugfix = release.split('.')
    if next_major:
        next_release = str.join('.', [str(int(major) + 1), '0', '0'])
    else:
        next_release = str.join('.', [major, str(int(minor) + 1), '0'])

    return "|{release} |{eol_date} | {next_release}\n".format(
        release=release,
        eol_date=eol_date,
        next_release=next_release
    )


def reconstitute_file(lines):
    """
    Take a list of lines which constitute a file and turn them into a string.

    Parameters
    ----------
    lines : list
        A list where each element is a line in a file

    Returns
    -------
    str
        A single string which has all the lines in the file separated by a
        newline
    """
    empty_str = ""
    return empty_str.join(lines)


def is_major(version):
    """
    Determine whether or not a given version string is major or minor

    Parameters
    ----------
    version : str
        A version in the form of x.y.z where [x,y,z] are all [0-9]

    Returns
    -------
    bool
        True if the version is a major release, as in 3.0.0. False if the
        version is a minor, as in 3.1.0
    """
    major, minor, bugfix = version.split('.')
    return minor == "0" and (bugfix == "x" or bugfix == "0")


def entrypoint(args):
    # Split the document by line
    split_file = split_file_by_lines(args)

    # Locate the index position of the table header
    table_header_position = find_header_marker(split_file)

    # Generate the new EOL entry
    new_entry = generate_eol_entry(args.release)

    # Insert the new entry
    split_file.insert(table_header_position, new_entry)

    # If this is a major release, we also need to edit the last minor
    if is_major(args.release):
        # Look up location of last minor
        last_minor_idx = find_last_minor_marker(split_file, args.release)
        last_minor_ver = last_minor_version(split_file, args.release)
        last_minor_entry = generate_eol_entry(last_minor_ver, next_major=True)
        split_file[last_minor_idx] = last_minor_entry

    # Rebuild the split list back into a string
    updated_file = reconstitute_file(split_file)

    # Show us the file!
    if args.quiet:
        return updated_file
    else:
        print(updated_file)
