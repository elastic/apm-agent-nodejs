#!/usr/bin/env groovy
@Library('apm@current') _

pipeline {
  agent any
  environment {
    BASE_DIR="src/github.com/elastic/apm-agent-nodejs"
    PIPELINE_LOG_LEVEL='INFO'
    NOTIFY_TO = credentials('notify-to')
    JOB_GCS_BUCKET = credentials('gcs-bucket')
    CODECOV_SECRET = 'secret/apm-team/ci/apm-agent-nodejs-codecov'
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
  triggers {
    cron 'H H(3-5) * * 1-5'
    issueCommentTrigger('(?i).*(?:jenkins\\W+)?run\\W+(?:the\\W+)?tests(?:\\W+please)?.*')
  }
  parameters {
    booleanParam(name: 'Run_As_Master_Branch', defaultValue: false, description: 'Allow to run any steps on a PR, some steps normally only run on master branch.')
    booleanParam(name: 'doc_ci', defaultValue: true, description: 'Enable build docs.')
    booleanParam(name: 'tav_ci', defaultValue: true, description: 'Enable TAV tests.')
  }
  stages {
    /**
    Checkout the code and stash it, to use it on other stages.
    */
    stage('Checkout') {
      agent { label 'master || immutable' }
      options { skipDefaultCheckout() }
      steps {
        deleteDir()
        gitCheckout(basedir: "${BASE_DIR}")
        stash allowEmpty: true, name: 'source', useDefaultExcludes: false
      }
    }
    /**
      Run tests.
    */
    stage('Test') {
      agent { label 'docker && immutable' }
      options { skipDefaultCheckout() }
      environment {
        HOME = "${env.WORKSPACE}"
      }
      steps {
        withGithubNotify(context: 'Test', tab: 'tests') {
          deleteDir()
          unstash 'source'
          script {
            docker.image('node:11').inside("-v ${WORKSPACE}/${BASE_DIR}:/app"){
              sh(label: "Basic tests", script: 'cd /app && .ci/scripts/test_basic.sh')
            }
          }
          dir("${BASE_DIR}"){
            script {
              def node = readYaml(file: '.ci/.jenkins_nodejs.yml')
              def parallelTasks = [:]
              node['NODEJS_VERSION'].each{ version ->
                parallelTasks["Node.js-${version}"] = generateStep(version)
              }
              parallel(parallelTasks)
            }
          }
        }
      }
    }
    /**
      Run TAV tests.
    */
    stage('TAV Test') {
      agent { label 'docker && immutable' }
      options { skipDefaultCheckout() }
      environment {
        HOME = "${env.WORKSPACE}"
      }
      when {
        beforeAgent true
        allOf {
          not {
            branch '^greenkeeper/.*'
          }
          anyOf {
            expression { return params.Run_As_Master_Branch }
            triggeredBy 'TimerTrigger'
            changeRequest()
          }
          expression { return params.tav_ci }
        }
      }
      steps {
        withGithubNotify(context: 'TAV Test', tab: 'tests') {
          deleteDir()
          unstash 'source'
          dir("${BASE_DIR}"){
            script {
              def node = readYaml(file: '.ci/.jenkins_tav_nodejs.yml')
              def tav = readYaml(file: '.ci/.jenkins_tav.yml')
              def parallelTasks = [:]
              node['NODEJS_VERSION'].each{ version ->
                tav['TAV'].each{ tav_item ->
                  parallelTasks["Node.js-${version}-${tav_item}"] = generateStep(version, tav_item)
                }
              }
              parallel(parallelTasks)
            }
          }
        }
      }
    }
    /**
    Build the documentation.
    */
    stage('Documentation') {
      agent { label 'docker && immutable' }
      options { skipDefaultCheckout() }
      when {
        beforeAgent true
        allOf {
          anyOf {
            branch 'master'
            branch "\\d+\\.\\d+"
            branch "v\\d?"
            tag "v\\d+\\.\\d+\\.\\d+*"
            expression { return params.Run_As_Master_Branch }
          }
          expression { return params.doc_ci }
        }
      }
      steps {
        deleteDir()
        unstash 'source'
        buildDocs(docsDir: "${BASE_DIR}/docs", archive: true)
      }
    }
  }
  post {
    always {
      notifyBuildResult()
    }
  }
}

def generateStep(version, tav = ''){
  return {
    node('docker && linux && immutable'){
      try {
        env.HOME = "${WORKSPACE}"
        deleteDir()
        unstash 'source'
        dir("${BASE_DIR}"){
          retry(2){
            sleep randomNumber(min:10, max: 30)
            sh(label: "Run Tests", script: ".ci/scripts/test.sh ${version} ${tav}")
          }
        }
      } catch(e){
        error(e.toString())
      } finally {
        docker.image('node:11').inside("-v ${WORKSPACE}/${BASE_DIR}:/app"){
          sh(label: "Convert Test results to JUnit format", script: 'cd /app && .ci/scripts/convert_tap_to_junit.sh')
        }
        junit(allowEmptyResults: true, keepLongStdio: true, testResults: "${BASE_DIR}/**/junit-*.xml")
        codecov(repo: 'apm-agent-nodejs', basedir: "${BASE_DIR}", secret: "${CODECOV_SECRET}")
      }
    }
  }
}
