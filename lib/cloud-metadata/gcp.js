/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

const URL = require('url').URL;
const JSONBigInt = require('json-bigint');
const { httpRequest } = require('../http-request');

const DEFAULT_BASE_URL = new URL('/', 'http://metadata.google.internal:80');

/**
 * Checks for metadata server then fetches data
 *
 * The getMetadataGcp function will fetch cloud metadata information
 * from Amazon's IMDSv1 endpoint and return (via callback)
 * the formatted metadata.
 *
 * Before fetching data, the server will be "pinged" by attempting
 * to connect via TCP with a short timeout. (`connectTimeoutMs`)
 *
 * https://cloud.google.com/compute/docs/storing-retrieving-metadata
 */
function getMetadataGcp(
  connectTimeoutMs,
  resTimeoutMs,
  logger,
  baseUrlOverride,
  cb,
) {
  const baseUrl = baseUrlOverride || DEFAULT_BASE_URL;
  const options = {
    method: 'GET',
    timeout: resTimeoutMs,
    connectTimeout: connectTimeoutMs,
    headers: {
      'Metadata-Flavor': 'Google',
    },
  };
  const url = baseUrl + 'computeMetadata/v1/?recursive=true';
  const req = httpRequest(url, options, function (res) {
    const finalData = [];
    res.on('data', function (data) {
      finalData.push(data);
    });

    res.on('end', function (data) {
      if (res.statusCode !== 200) {
        logger.debug('gcp metadata: unexpected statusCode: %s', res.statusCode);
        cb(
          new Error(
            'error fetching gcp metadata: unexpected statusCode: ' +
              res.statusCode,
          ),
        );
        return;
      }
      // Note: We could also guard on the response having the
      // 'Metadata-Flavor: Google' header as done by:
      // https://github.com/googleapis/gcp-metadata/blob/v6.0.0/src/index.ts#L109-L112

      let result;
      try {
        result = formatMetadataStringIntoObject(finalData.join(''));
      } catch (err) {
        logger.debug(
          'gcp metadata server responded, but there was an ' +
            'error parsing the result: %o',
          err,
        );
        cb(err);
        return;
      }
      cb(null, result);
    });
  });

  req.on('timeout', function () {
    req.destroy(new Error('request to metadata server timed out'));
  });

  req.on('connectTimeout', function () {
    req.destroy(new Error('could not ping metadata server'));
  });

  req.on('error', function (err) {
    cb(err);
  });

  req.end();
}

/**
 * Builds metadata object
 *
 * Convert a GCP Cloud Engine VM metadata response
 * (https://cloud.google.com/compute/docs/metadata/default-metadata-values)
 * to the APM intake cloud metadata object
 * (https://github.com/elastic/apm/blob/main/specs/agents/metadata.md#gcp-metadata).
 *
 * See discussion about big int values here:
 * https://github.com/googleapis/gcp-metadata#take-care-with-large-number-valued-properties
 * This implementation is using the same 'json-bigint' library as 'gcp-metadata'.
 */
function formatMetadataStringIntoObject(string) {
  const data = JSONBigInt.parse(string);

  // E.g., 'projects/513326162531/zones/us-west1-b' -> 'us-west1-b'
  const az = data.instance.zone.split('/').pop();

  const metadata = {
    provider: 'gcp',
    instance: {
      id: data.instance.id.toString(), // We expect this to be a BigInt.
      name: data.instance.name,
    },
    project: {
      id: data.project.projectId,
    },
    availability_zone: az,
    region: az.slice(0, az.lastIndexOf('-')), // 'us-west1-b' -> 'us-west1'
    machine: {
      type: data.instance.machineType.split('/').pop(),
    },
  };

  return metadata;
}

module.exports = { getMetadataGcp };
