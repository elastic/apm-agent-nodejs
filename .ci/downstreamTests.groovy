#!/usr/bin/env groovy
@Library('apm@current') _

import co.elastic.matrix.*
import groovy.transform.Field

/**
This is the parallel tasks generator,
it is need as field to store the results of the tests.
*/
@Field def nodeTasksGen

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
    buildDiscarder(logRotator(numToKeepStr: '100', artifactNumToKeepStr: '100', daysToKeepStr: '30'))
    timestamps()
    ansiColor('xterm')
    disableResume()
    durabilityHint('PERFORMANCE_OPTIMIZED')
    rateLimitBuilds(throttle: [count: 60, durationName: 'hour', userBoost: true])
    quietPeriod(10)
  }
  parameters {
    string(name: 'NODE_VERSION', defaultValue: "11", description: "Node.js version to test")
    string(name: 'BRANCH_SPECIFIER', defaultValue: "master", description: "Git branch/tag to use")
    string(name: 'CHANGE_TARGET', defaultValue: "master", description: "Git branch/tag to merge before building")
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
        gitCheckout(basedir: "${BASE_DIR}",
          branch: "${params.BRANCH_SPECIFIER}",
          repo: "${REPO}",
          credentialsId: "${JOB_GIT_CREDENTIALS}",
          mergeTarget: "${params.CHANGE_TARGET}"
          reference: '/var/lib/jenkins/apm-agent-nodejs.git')
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
            nodeTasksGen = new NodeParallelTaskGenerator(
              xVersions: [ "${NODE_VERSION}" ],
              yKey: 'TAV',
              yFile: ".ci/.jenkins_tav.yml",
              tag: "Node",
              name: "Node",
              steps: this
              )
            def mapPatallelTasks = nodeTasksGen.generateParallelTests()
            parallel(mapPatallelTasks)
          }
        }
      }
    }
  }
  post {
    always{
      script{
        if(nodeTasksGen?.results){
          writeJSON(file: 'results.json', json: toJSON(nodeTasksGen.results), pretty: 2)
          def mapResults = ["${params.agent_integration_test}": nodeTasksGen.results]
          def processor = new ResultsProcessor()
          processor.processResults(mapResults)
          archiveArtifacts allowEmptyArchive: true, artifacts: 'results.json,results.html', defaultExcludes: false
        }
      }
    }
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

/**
Parallel task generator for the integration tests.
*/
class NodeParallelTaskGenerator extends DefaultParallelTaskGenerator {

  public NodeParallelTaskGenerator(Map params){
    super(params)
  }

  /**
  build a clousure that launch and agent and execute the corresponding test script,
  then store the results.
  */
  public Closure generateStep(x, y){
    return {
      steps.node('docker && linux && immutable'){
        try {
          steps.runScript(node: x, tav: y)
          saveResult(x, y, 1)
        } catch(e){
          saveResult(x, y, 0)
          error("${label} tests failed : ${e.toString()}\n")
        } finally {
          wrappingUp()
        }
      }
    }
  }
}

/**
  Run the TAV test script
*/
def runScript(Map params = [:]){
  env.HOME = "${WORKSPACE}"
  deleteDir()
  unstash 'source'
  dir("${BASE_DIR}"){
    retry(2){
      sleep randomNumber(min:10, max: 30)
      sh(label: "Run Tests", script: ".ci/test.sh ${params.node} ${params.tav}")
    }
  }
}

/**
  Collect test results and report to Codecov
*/
def wrappingUp(){
  docker.image('node:11').inside("-v ${WORKSPACE}/${BASE_DIR}:/app"){
    steps.sh(label: "Convert Test results to JUnit format", script: 'cd /app && .ci/convert_tap_to_junit.sh')
  }
  junit(allowEmptyResults: true, keepLongStdio: true, testResults: "${BASE_DIR}/**/junit-*.xml")
  codecov(repo: 'apm-agent-nodejs', basedir: "${BASE_DIR}", secret: "${CODECOV_SECRET}")
}
