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
              // Prepare context for running all the services in the linux agent
              sh label: 'Run required services', script: '.ci/scripts/run-services.sh'
              def hostService = sh(label: 'Get IP', script: 'hostname -I | awk "{print $1}"', returnStdout: true)
              def node = readYaml(file: '.ci/.jenkins_nodejs.yml')
              def parallelTasks = [:]
              parallelTasks["Windows-Node.js-12"] = generateStepForWindows(version: '12', host: hostService)
              parallel(parallelTasks)
            }
          }
        }
      }
      post {
        always {
          dir("${BASE_DIR}"){
            sh label: 'Stop docker', returnStatus: true, script: '.ci/scripts/stop-services.sh'
          }
        }
      }
    }
  }
}

def generateStepForWindows(Map params = [:]){
  def version = params?.version
  def host = params?.host
  def disableAsyncHooks = params.get('disableAsyncHooks', false)
  return {
    node('windows-2019-docker-immutable'){
      try {
        env.HOME = "${WORKSPACE}"
        // When installing with choco the PATH might not be updated within the already connected worker.
        env.PATH = "${PATH};C:\\Program Files\\nodejs"
        env.VERSION = "${version}"
        if (disableAsyncHooks) {
          env.ELASTIC_APM_ASYNC_HOOKS = 'false'
        }
        env.CASSANDRA_HOST = host
        env.ES_HOST = host
        env.MONGODB_HOST = host
        env.MSSQL_HOST = host
        env.MYSQL_HOST = host
        env.PGHOST = host
        env.REDIS_HOST = host
        deleteDir()
        unstash 'source'
        dir(BASE_DIR) {
          powershell label: 'Ping', script: "Test-Connection $env:host -IPv4 -TimeoutSeconds 30"
          powershell label: 'Install tools', script: ".\\.ci\\scripts\\windows\\install-tools.ps1"
          /**bat label: 'Run cassandra', script: '''
            cd .ci/scripts/windows/docker/cassandra
            docker build --tag=cassandra .
            docker run -d -p 7000:7000 -p 9042:9042 --name cassandra cassandra
            docker ps
          '''
          bat label: 'Run redis', script: '''
            cd .ci/scripts/windows/docker/redis
            docker build --tag=redis .
            docker run -d -p 6379:6379 --name redis redis
            docker ps
          '''
          bat label: 'Run elasticsearch', script: '''
            cd .ci/scripts/windows/docker/elasticsearch
            docker build --tag=elasticsearch .
            docker run -d -p 9200:9200 -p 9300:9300 --name elasticsearch elasticsearch
            docker ps
          '''
          bat label: 'Run mongodb', script: '''
            cd .ci/scripts/windows/docker/mongodb
            docker build --tag=mongodb .
            docker run -d -p 27017:27017 --name mongodb mongodb
            docker ps
          '''
          bat label: 'Run postgres', script: '''
            cd .ci/scripts/windows/docker/postgres
            docker build --tag=postgres .
            docker run -d -p 5432:5432 --name postgres postgres
            docker ps
          '''
          bat label: 'Run mssql', script: '''
            docker run -d -p 1433:1433 -e sa_password=Very(!)Secure -e ACCEPT_EULA=Y --name mssql microsoft/mssql-server-windows-developer
            docker ps
          ''', returnStatus: true */
          bat label: 'Tool versions', script: '''
            npm --version
            node --version
          '''
          bat 'npm install'
          bat 'node test/test.js'
        }
      } catch(e){
        error(e.toString())
      } finally {
        bat label: 'Docker ps', returnStatus: true, script: 'docker ps -a'
        /**bat label: 'Gather cassandra logs', returnStatus: true, script: 'docker logs cassandra'
        bat label: 'Gather elasticsearch logs', returnStatus: true, script: 'docker logs elasticsearch'
        bat label: 'Gather mssql logs', returnStatus: true, script: 'docker logs mssql'
        bat label: 'Gather mongodb logs', returnStatus: true, script: 'docker logs mongodb'
        bat label: 'Gather postgres logs', returnStatus: true, script: 'docker logs postgres'
        bat label: 'Gather redis logs', returnStatus: true, script: 'docker logs redis'
        */
      }
    }
  }
}
