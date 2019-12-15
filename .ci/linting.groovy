#!/usr/bin/env groovy
@Library('apm@current') _

pipeline {
  agent { label 'linux && immutable' }
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
    stage('Linting Test') {
      steps {
        stash name: 'source', useDefaultExcludes: false
        script {
          verifyChangesAreApproved()
          def node = readYaml(file: '.ci/.jenkins_nodejs.yml')
          def parallelTasks = [:]
          node['NODEJS_VERSION'].each { version ->
            parallelTasks["Linting-${version}"] = generateStep(version: version)
          }
          parallel(parallelTasks)
        }
      }
    }
  }
}

def generateStep(Map params = [:]){
  def version = params?.version
  return {
    node('linux && immutable'){
      dir(version) {
        unstash 'source'
        docker.image("node:${version}").inside("-v ${WORKSPACE}/${version}:/app"){
          withEnv(["HOME=/app"]) {
            if (version?.equals('12')) {
              sh(label: 'Basic tests I', script: 'cd /app && .ci/scripts/test_basic.sh')
            }
            sh(label: 'Basic tests II', script: 'cd /app && .ci/scripts/test_types_babel_esm.sh')
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
                  files=".ci/scripts/test_basic.sh .ci/scripts/test_types_babel_esm.sh"
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
