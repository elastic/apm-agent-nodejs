#!/usr/bin/env groovy
@Library('apm@v1.0.6') _

pipeline {
  agent any
  environment {
    BASE_DIR="src/github.com/elastic/apm-agent-nodejs"
    PIPELINE_LOG_LEVEL='INFO'
    NOTIFY_TO = credentials('notify-to')
    JOB_GCS_BUCKET = credentials('gcs-bucket')
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
    issueCommentTrigger('.*(?:jenkins\\W+)?run\\W+(?:the\\W+)?tests(?:\\W+please)?.*')
  }
  parameters {
    booleanParam(name: 'Run_As_Master_Branch', defaultValue: false, description: 'Allow to run any steps on a PR, some steps normally only run on master branch.')
    booleanParam(name: 'doc_ci', defaultValue: true, description: 'Enable build docs.')
  }
  stages {
    /**
    Checkout the code and stash it, to use it on other stages.
    */
    stage('Checkout') {
      agent { label 'linux && immutable' }
      options { skipDefaultCheckout() }
      steps {
        deleteDir()
        gitCheckout(basedir: "${BASE_DIR}")
        stash allowEmpty: true, name: 'source', useDefaultExcludes: false
      }
    }
    /**
    Build the project from code..
    */
    stage('Test') {
      agent { label 'linux && immutable' }
      options { skipDefaultCheckout() }
      environment {
        HOME = "${env.WORKSPACE}"
        JUNIT = "true"
      }
      failFast true
      steps {
        deleteDir()
        unstash 'source'
        dir("${BASE_DIR}"){
          script {
            def node = readYaml(file: 'test/.jenkins_nodejs.yml')
            def parallelTasks = [:]
            node['NODEJS_VERSION'].each{ version ->
              parallelTasks["Node.js-${version}"] = generateStep(version)
            }
            parallel(parallelTasks)
          }
        }
      }
    }
    /**
    Build the documentation.
    */
    stage('Documentation') {
      agent { label 'linux && immutable' }
      options { skipDefaultCheckout() }
      when {
        beforeAgent true
        allOf {
          anyOf {
            not {
              changeRequest()
            }
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
    success {
      echoColor(text: '[SUCCESS]', colorfg: 'green', colorbg: 'default')
    }
    aborted {
      echoColor(text: '[ABORTED]', colorfg: 'magenta', colorbg: 'default')
    }
    failure {
      echoColor(text: '[FAILURE]', colorfg: 'red', colorbg: 'default')
      step([$class: 'Mailer', notifyEveryUnstableBuild: true, recipients: "${NOTIFY_TO}", sendToIndividuals: false])
    }
    unstable {
      echoColor(text: '[UNSTABLE]', colorfg: 'yellow', colorbg: 'default')
    }
  }
}

def generateStep(version, tav = ''){
  return {
    node('docker && linux && immutable'){
      try {
        deleteDir()
        unstash 'source'
        dir("${BASE_DIR}"){
          retry(2){
            sleep randomNumber(min:10, max: 30)
            sh "./test/script/run_tests.sh all ${version} ${tav}"
          }
        }
      } catch(e){
        error(e)
      } finally {
        junit(allowEmptyResults: true,
          keepLongStdio: true,
          testResults: "**/junit-node-report.xml")
        codecov(repo: 'apm-agent-nodejs', basedir: "${BASE_DIR}")
      }
    }
  }
}
