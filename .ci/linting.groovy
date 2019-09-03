#!/usr/bin/env groovy
@Library('apm@current') _

pipeline {
  agent 'docker && immutable'
  environment {
    HOME = "${env.WORKSPACE}"
  }
  options {
    buildDiscarder(logRotator(numToKeepStr: '20', artifactNumToKeepStr: '20', daysToKeepStr: '30'))
    timestamps()
    ansiColor('xterm')
    disableResume()
    durabilityHint('PERFORMANCE_OPTIMIZED')
    rateLimitBuilds(throttle: [count: 60, durationName: 'hour', userBoost: true])
    quietPeriod(10)
  }
  triggers {
    issueCommentTrigger('(?i).*(?:jenkins\\W+)?run\\W+(?:the\\W+)?lint(?:\\W+please)?.*')
  }
  stages {
    stage('Basic Test') {
      steps {
        script {
          docker.image('node:12').inside("-v ${WORKSPACE}:/app"){
            sh(label: 'Basic tests', script: 'cd /app && .ci/scripts/test_basic.sh')
            sh(label: 'Lint commits', script: 'cd /app && .ci/scripts/lint-commits.sh')
          }
        }
      }
    }
  }
}
