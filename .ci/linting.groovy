#!/usr/bin/env groovy
@Library('apm@current') _

pipeline {
  agent { label 'docker && immutable' }
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
          verifyChangesAreApproved()
          docker.image('node:12').inside("-v ${WORKSPACE}:/app"){
            sh(label: 'Basic tests', script: 'cd /app && .ci/scripts/test_basic.sh')
            sh(label: 'Lint commits', script: 'cd /app && .ci/scripts/lint-commits.sh')
          }
        }
      }
    }
  }
}

def verifyChangesAreApproved() {
  def ret = 0
  catchError(buildResult: 'SUCCESS', message: 'Trap any errors') {
    // This is required to populate the env variables
    githubEnv()
    if (!githubPrCheckApproved()) {
       ret = sh(label: 'Validate changes',
                script: '''
                  files=".ci/scripts/test_basic.sh .ci/scripts/lint-commits.sh"
                  for file in $files; do
                    git diff --name-only ${GIT_PREVIOUS_COMMIT}...${GIT_COMMIT} | grep ${files} && exit 1 || true
                  done''',
                returnStatus: true)
    }
  }
  if(ret != 0){
    error('The PR is not approved yet')
  }
}
