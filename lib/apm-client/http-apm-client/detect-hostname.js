/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

// Detect the current hostname, preferring the FQDN if possible.
// Spec: https://github.com/elastic/apm/blob/main/specs/agents/metadata.md#hostname

const os = require('os');
const { spawnSync } = require('child_process');

/**
 * *Synchronously* detect the current hostname, preferring the FQDN.
 * This is sent to APM server as `metadata.system.detected_hostname`
 * and is intended to fit the ECS `host.name` value
 * (https://www.elastic.co/guide/en/ecs/current/ecs-host.html#field-host-name).
 *
 * @returns {String}
 */
function detectHostname() {
  let hostname = null;
  let out;
  const fallback = os.hostname();

  switch (os.platform()) {
    case 'win32':
      // https://learn.microsoft.com/en-us/dotnet/api/system.net.dns.gethostentry
      out = spawnSync(
        'powershell.exe',
        ['[System.Net.Dns]::GetHostEntry($env:computerName).HostName'],
        { encoding: 'utf8', shell: true, timeout: 2000 },
      );
      if (!out.error) {
        hostname = out.stdout.trim();
        break;
      }

      // https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/hostname
      out = spawnSync('hostname.exe', {
        encoding: 'utf8',
        shell: true,
        timeout: 2000,
      });
      if (!out.error) {
        hostname = out.stdout.trim();
        break;
      }

      if ('COMPUTERNAME' in process.env) {
        hostname = process.env['COMPUTERNAME'].trim(); // eslint-disable-line dot-notation
      }
      break;

    default:
      out = spawnSync('/bin/hostname', ['-f'], {
        encoding: 'utf8',
        shell: false,
        timeout: 500,
      });
      if (!out.error) {
        hostname = out.stdout.trim();
      }
      // I'm going a little off of the APM spec here by *not* falling back to
      // HOSTNAME or HOST envvars. Latest discussion point is here:
      // https://github.com/elastic/apm/pull/517#issuecomment-940973458
      // My understanding is HOSTNAME is a *Bash*-set envvar.
      break;
  }

  if (!hostname) {
    hostname = fallback;
  }
  hostname = hostname.trim().toLowerCase();
  return hostname;
}

module.exports = {
  detectHostname,
};

// ---- main

if (require.main === module) {
  console.log(detectHostname());
}
