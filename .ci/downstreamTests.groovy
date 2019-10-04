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
  agent { label 'linux && immutable' }
  environment {
    REPO = 'apm-agent-nodejs'
    BASE_DIR="src/github.com/elastic/${REPO}"
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
    string(name: 'NODE_VERSION', defaultValue: "12", description: "Node.js version to test")
    string(name: 'BRANCH_SPECIFIER', defaultValue: "master", description: "Git branch/tag to use")
    string(name: 'MERGE_TARGET', defaultValue: "master", description: "Git branch/tag to merge before building")
  }
  stages {
    /**
    Checkout the code and stash it, to use it on other stages.
    */
    stage('Checkout') {
      options { skipDefaultCheckout() }
      steps {
        deleteDir()
        gitCheckout(basedir: "${BASE_DIR}",
          branch: "${params.BRANCH_SPECIFIER}",
          repo: "${REPO}",
          credentialsId: "${JOB_GIT_CREDENTIALS}",
          mergeTarget: "${params.MERGE_TARGET}",
          reference: '/var/lib/jenkins/apm-agent-nodejs.git')
        stash allowEmpty: true, name: 'source', useDefaultExcludes: false
      }
    }
    /**
      Run TAV tests.
    */
    stage('TAV Test') {
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
    cleanup{
      script{
        if(nodeTasksGen?.results){
          writeJSON(file: 'results.json', json: toJSON(nodeTasksGen.results), pretty: 2)
          def mapResults = ["${params.agent_integration_test}": nodeTasksGen.results]
          def processor = new ResultsProcessor()
          processor.processResults(mapResults)
          archiveArtifacts allowEmptyArchive: true, artifacts: 'results.json,results.html', defaultExcludes: false
          catchError(buildResult: 'SUCCESS') {
            def datafile = readFile(file: "results.json")
            def json = getVaultSecret(secret: 'secret/apm-team/ci/jenkins-stats-cloud')
            sendDataToElasticsearch(es: json.data.url, data: datafile, restCall: '/jenkins-builds-nodejs-test-results/_doc/')
          }
        }
      }
      notifyBuildResult()
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
          steps.error("${label} tests failed : ${e.toString()}\n")
        } finally {
          steps.wrappingUp()
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
  docker.image('node:12').inside("-v ${WORKSPACE}/${BASE_DIR}:/app"){
    sh(label: "Convert Test results to JUnit format", script: 'cd /app && .ci/scripts/convert_tap_to_junit.sh')
  }
  junit(allowEmptyResults: true, keepLongStdio: true, testResults: "${BASE_DIR}/**/junit-*.xml")
  codecov(repo: env.REPO, basedir: "${BASE_DIR}", secret: "${CODECOV_SECRET}")
}
