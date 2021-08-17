// Licensed to Elasticsearch B.V. under one or more contributor
// license agreements. See the NOTICE file distributed with
// this work for additional information regarding copyright
// ownership. Elasticsearch B.V. licenses this file to you under
// the Apache License, Version 2.0 (the "License"); you may
// not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied.  See the License for the
// specific language governing permissions and limitations
// under the License.

@Library('apm@current') _

pipeline {
  agent { label 'master' }
  environment {
    NOTIFY_TO = credentials('notify-to')
    PIPELINE_LOG_LEVEL='INFO'
  }
  options {
    timeout(time: 1, unit: 'HOURS')
    buildDiscarder(logRotator(numToKeepStr: '20', artifactNumToKeepStr: '20', daysToKeepStr: '30'))
    timestamps()
    ansiColor('xterm')
    disableResume()
    durabilityHint('PERFORMANCE_OPTIMIZED')
  }
  triggers {
    cron('H H(4-5) * * 1-5')
  }
  stages {
    stage('Run Tasks'){
      steps {
        script {
          ['master'].each { branch ->
            build(
              job: "apm-agent-nodejs/apm-agent-nodejs-mbp/${branch}",
              parameters: [
                booleanParam(name: 'Run_As_Master_Branch', value: true),
                booleanParam(name: 'bench_ci', value: false),
                booleanParam(name: 'doc_ci', value: true),
                booleanParam(name: 'tav_ci', value: true),
                booleanParam(name: 'test_edge_ci', value: true)
              ],
              quietPeriod: 10,
              wait: false
            )
          }
        }
      }
    }
  }
  post {
    cleanup {
      notifyBuildResult()
    }
  }
}
