#!/usr/bin/env groovy
@Library('apm@current') _

pipeline {
  agent any
  environment {
    REPO = 'apm-agent-nodejs'
    BASE_DIR = "src/github.com/elastic/${env.REPO}"
    PIPELINE_LOG_LEVEL='INFO'
    NOTIFY_TO = credentials('notify-to')
    JOB_GCS_BUCKET = credentials('gcs-bucket')
    CODECOV_SECRET = "secret/apm-team/ci/${env.REPO}-codecov"
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
        gitCheckout(basedir: "${BASE_DIR}", githubNotifyFirstTimeContributor: true)
        stash allowEmpty: true, name: 'source', useDefaultExcludes: false
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
      steps {
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
        docker.image('node:12').inside("-v ${WORKSPACE}/${BASE_DIR}:/app"){
          sh(label: "Convert Test results to JUnit format", script: 'cd /app && .ci/scripts/convert_tap_to_junit.sh')
        }
        junit(allowEmptyResults: true, keepLongStdio: true, testResults: "${BASE_DIR}/**/junit-*.xml")
        codecov(repo: env.REPO, basedir: "${BASE_DIR}", secret: "${CODECOV_SECRET}")
      }
    }
  }
}
