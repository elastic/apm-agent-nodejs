var example = {
  resource: {
    attributes: {
      trentm_flav: 'intakev2',
      'service.name': 'metrics-otlphttp-exporter',
      'deployment.environment': 'development'
    }
  },
  scopeMetrics: [
    {
      scope: {
        name: 'metrics-exporter-play',
        version: '',
        schemaUrl: undefined
      },
      metrics: [
        {
          descriptor: {
            name: 'test_counter',
            type: 'COUNTER',
            description: 'Example of a Counter',
            unit: '',
            valueType: 1
          },
          aggregationTemporality: 1,
          dataPointType: 3,
          dataPoints: [
            {
              attributes: {},
              startTime: [ 1668731968, 76103323 ],
              endTime: [ 1668731974, 75051494 ],
              value: 2
            },
            {
              attributes: { environment: 'staging', pid: 84438 },
              startTime: [ 1668731968, 76356373 ],
              endTime: [ 1668731974, 75051494 ],
              value: 6
            },
            {
              attributes: { environment: 'dev' },
              startTime: [ 1668731968, 76422620 ],
              endTime: [ 1668731974, 75051494 ],
              value: 1
            }
          ],
          isMonotonic: true
        },
        {
          descriptor: {
            name: 'test_counter2',
            type: 'COUNTER',
            description: 'Example counter with its own attributes',
            unit: '',
            valueType: 1
          },
          aggregationTemporality: 1,
          dataPointType: 3,
          dataPoints: [
            {
              attributes: { pid: 84438, environment: 'staging' },
              startTime: [ 1668731969, 77379138 ],
              endTime: [ 1668731974, 75051494 ],
              value: 10
            }
          ],
          isMonotonic: true
        },
        {
          descriptor: {
            name: 'test_up_down_counter',
            type: 'UP_DOWN_COUNTER',
            description: 'Example of a UpDownCounter',
            unit: '',
            valueType: 1
          },
          aggregationTemporality: 1,
          dataPointType: 3,
          dataPoints: [
            {
              attributes: { pid: 84438, environment: 'staging' },
              startTime: [ 1668731969, 77501965 ],
              endTime: [ 1668731974, 75051494 ],
              value: -1
            }
          ],
          isMonotonic: false
        },
        {
          descriptor: {
            name: 'test_histogram',
            type: 'HISTOGRAM',
            description: 'Example of a Histogram',
            unit: '',
            valueType: 1
          },
          aggregationTemporality: 1,
          dataPointType: 0,
          dataPoints: [
            {
              attributes: { pid: 84438, environment: 'staging' },
              startTime: [ 1668731969, 77638816 ],
              endTime: [ 1668731974, 75051494 ],
              value: {
                min: 0.3347393384931221,
                max: 0.9889283214296507,
                sum: 3.2474350366549567,
                buckets: {
                  boundaries: [
                      0,    5,  10,  25,
                     50,   75, 100, 250,
                    500, 1000
                  ],
                  counts: [
                    0, 5, 0, 0, 0,
                    0, 0, 0, 0, 0,
                    0
                  ]
                },
                count: 5
              }
            }
          ]
        }
      ]
    }
  ]
}
