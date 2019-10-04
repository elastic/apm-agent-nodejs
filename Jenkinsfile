#!/usr/bin/env groovy
@Library('apm@current') _

pipeline {
  agent { label 'linux && immutable' }
  environment {
    REPO = 'apm-agent-nodejs'
    BASE_DIR = "src/github.com/elastic/${env.REPO}"
    PIPELINE_LOG_LEVEL='INFO'
    NOTIFY_TO = credentials('notify-to')
    JOB_GCS_BUCKET = credentials('gcs-bucket')
    CODECOV_SECRET = 'secret/apm-team/ci/apm-agent-nodejs-codecov'
    GITHUB_CHECK_ITS_NAME = 'Integration Tests'
    ITS_PIPELINE = 'apm-integration-tests-selector-mbp/master'
  }
  options {
    timeout(time: 3, unit: 'HOURS')
    buildDiscarder(logRotator(numToKeepStr: '20', artifactNumToKeepStr: '20', daysToKeepStr: '30'))
    timestamps()
    ansiColor('xterm')
    disableResume()
    durabilityHint('PERFORMANCE_OPTIMIZED')
    rateLimitBuilds(throttle: [count: 60, durationName: 'hour', userBoost: true])
    quietPeriod(10)
  }
  parameters {
    booleanParam(name: 'Run_As_Master_Branch', defaultValue: false, description: 'Allow to run any steps on a PR, some steps normally only run on master branch.')
    booleanParam(name: 'tests_ci', defaultValue: true, description: 'Enable tests.')
  }
  stages {
    /**
    Checkout the code and stash it, to use it on other stages.
    */
    stage('Checkout') {
      options { skipDefaultCheckout() }
      steps {
        deleteDir()
        gitCheckout(basedir: "${BASE_DIR}", githubNotifyFirstTimeContributor: true)
        stash allowEmpty: true, name: 'source', useDefaultExcludes: false
      }
    }
    /**
      Run tests.
    */
    stage('Test') {
      options { skipDefaultCheckout() }
      environment {
        HOME = "${env.WORKSPACE}"
      }
      when {
        beforeAgent true
        expression { return params.tests_ci }
      }
      steps {
        withGithubNotify(context: 'Test', tab: 'tests') {
          deleteDir()
          unstash 'source'
          dir("${BASE_DIR}"){
            script {
              def node = readYaml(file: '.ci/.jenkins_nodejs.yml')
              def parallelTasks = [:]
              parallelTasks["Windows-Node.js-12"] = generateStepForWindows(version: '12')

              parallel(parallelTasks)
            }
          }
        }
      }
    }
  }
}

def generateStepForWindows(Map params = [:]){
  def version = params?.version
  def edge = params.containsKey('edge') ? params.edge : false
  def disableAsyncHooks = params.get('disableAsyncHooks', false)
  return {
    node('windows-2019-docker-immutable'){
      try {
        env.HOME = "${WORKSPACE}"
        // Ensure the JDK is the one installed
        env.JAVA_HOME = 'C:\\java'
        // When installing with choco the PATH might not be updated within the already connected worker.
        env.PATH = "${env.JAVA_HOME}\\bin;${PATH};C:\\Program Files\\nodejs"
        env.VERSION = "${version}"
        if (disableAsyncHooks) {
          env.ELASTIC_APM_ASYNC_HOOKS = 'false'
        }
        deleteDir()
        unstash 'source'
        dir(BASE_DIR) {
          powershell label: 'Install tools', script: ".\\.ci\\scripts\\windows\\install-tools.ps1"
          powershell label: 'Install cassandra', script: ".\\.ci\\scripts\\windows\\install-cassandra.ps1"
          //powershell label: 'Install redis', script: ".\\.ci\\scripts\\windows\\install-redis.ps1"
          //powershell label: 'Install elasticsearch', script: ".\\.ci\\scripts\\windows\\install-elasticsearch.ps1"
          bat label: 'Tool versions', script: '''
            npm --version
            node --version
          '''
          bat 'npm install'
          bat 'node test/test.js'
        }
      } catch(e){
        error(e.toString())
      }
    }
  }
}
