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
  triggers {
    issueCommentTrigger('(?i).*(?:jenkins\\W+)?run\\W+(?:the\\W+)?tests(?:\\W+please)?.*')
  }
  parameters {
    booleanParam(name: 'Run_As_Master_Branch', defaultValue: false, description: 'Allow to run any steps on a PR, some steps normally only run on master branch.')
    booleanParam(name: 'doc_ci', defaultValue: true, description: 'Enable build docs.')
    booleanParam(name: 'tav_ci', defaultValue: true, description: 'Enable TAV tests.')
    booleanParam(name: 'test_edge_ci', defaultValue: true, description: 'Enable tests for edge versions of nodejs.')
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
      Lint commit messages
    */
    stage('Lint commit messages') {
      agent { label 'docker && immutable' }
      options { skipDefaultCheckout() }
      environment {
        HOME = "${env.WORKSPACE}"
      }
      steps {
        withGithubNotify(context: 'Lint Commit Messages') {
          deleteDir()
          unstash 'source'
          script {
            docker.image('node:12').inside("-v ${WORKSPACE}/${BASE_DIR}:/app"){
              sh(label: "Basic tests", script: 'cd /app && .ci/scripts/lint-commits.sh')
            }
          }
        }
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
            docker.image('node:12').inside("-v ${WORKSPACE}/${BASE_DIR}:/app"){
              sh(label: "Basic tests", script: 'cd /app && .ci/scripts/test_basic.sh')
            }
          }
          dir("${BASE_DIR}"){
            script {
              def node = readYaml(file: '.ci/.jenkins_nodejs.yml')
              def parallelTasks = [:]
              def parallelTasksWithoutAsyncHooks = [:]
              node['NODEJS_VERSION'].each{ version ->
                parallelTasks["Node.js-${version}"] = generateStep(version: version)
                parallelTasksWithoutAsyncHooks["Node.js-${version}-async-hooks-false"] = generateStep(version: version)
              }

              env.ELASTIC_APM_ASYNC_HOOKS = "true"
              parallel(parallelTasks)

              env.ELASTIC_APM_ASYNC_HOOKS = "false"
              parallel(parallelTasksWithoutAsyncHooks)
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
                  parallelTasks["Node.js-${version}-${tav_item}"] = generateStep(version: version, tav: tav_item)
                }
              }
              parallel(parallelTasks)
            }
          }
        }
      }
    }
    /**
      Run Edge tests.
    */
    stage('Edge Test') {
      agent none
      options { skipDefaultCheckout() }
      environment {
        HOME = "${env.WORKSPACE}"
      }
      when {
        beforeAgent true
        allOf {
          anyOf {
            expression { return params.Run_As_Master_Branch }
            triggeredBy 'TimerTrigger'
          }
          expression { return params.test_edge_ci }
        }
      }
      stages {
        stage('Nightly Test') {
          agent { label 'docker && immutable' }
          environment {
            NVM_NODEJS_ORG_MIRROR = "https://nodejs.org/download/nightly/"
          }
          steps {
            withGithubNotify(context: 'Nightly Test', tab: 'tests') {
              deleteDir()
              unstash 'source'
              dir("${BASE_DIR}"){
                script {
                  def node = readYaml(file: '.ci/.jenkins_edge_nodejs.yml')
                  def parallelTasks = [:]
                  node['NODEJS_VERSION'].each{ version ->
                    parallelTasks["Node.js-${version}-nightly"] = generateStep(version: version, edge: true)
                  }
                  parallel(parallelTasks)
                }
              }
            }
          }
        }
        stage('RC Test') {
          agent { label 'docker && immutable' }
          environment {
            NVM_NODEJS_ORG_MIRROR = "https://nodejs.org/download/rc/"
          }
          steps {
            withGithubNotify(context: 'RC Test', tab: 'tests') {
              deleteDir()
              unstash 'source'
              dir("${BASE_DIR}"){
                script {
                  def node = readYaml(file: '.ci/.jenkins_edge_nodejs.yml')
                  def parallelTasks = [:]
                  node['NODEJS_VERSION'].each{ version ->
                    parallelTasks["Node.js-${version}-rc"] = generateStep(version: version, edge: true)
                  }
                  parallel(parallelTasks)
                }
              }
            }
          }
        }
        stage('RC Test - No async hooks') {
          agent { label 'docker && immutable' }
          environment {
            NVM_NODEJS_ORG_MIRROR = "https://nodejs.org/download/rc/"
            ELASTIC_APM_ASYNC_HOOKS = "false"
          }
          steps {
            withGithubNotify(context: 'RC No Asyn Hooks Test', tab: 'tests') {
              deleteDir()
              unstash 'source'
              dir("${BASE_DIR}"){
                script {
                  def node = readYaml(file: '.ci/.jenkins_edge_nodejs.yml')
                  def parallelTasks = [:]
                  node['NODEJS_VERSION'].findAll{ it != '6' }.each{ version ->
                    parallelTasks["Node.js-${version}-nightly-no_async_hooks"] = generateStep(version: version, edge: true)
                  }
                  parallel(parallelTasks)
                }
              }
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
    stage('Integration Tests') {
      agent none
      when {
        beforeAgent true
        allOf {
          anyOf {
            environment name: 'GIT_BUILD_CAUSE', value: 'pr'
            expression { return !params.Run_As_Master_Branch }
          }
        }
      }
      steps {
        log(level: 'INFO', text: 'Launching Async ITs')
        build(job: env.ITS_PIPELINE, propagate: false, wait: false,
              parameters: [string(name: 'AGENT_INTEGRATION_TEST', value: 'Node.js'),
                           string(name: 'BUILD_OPTS', value: "--nodejs-agent-package ${env.CHANGE_FORK?.trim() ?: 'elastic' }/${env.REPO}#${env.GIT_BASE_COMMIT}"),
                           string(name: 'GITHUB_CHECK_NAME', value: env.GITHUB_CHECK_ITS_NAME),
                           string(name: 'GITHUB_CHECK_REPO', value: env.REPO),
                           string(name: 'GITHUB_CHECK_SHA1', value: env.GIT_BASE_COMMIT)])
        githubNotify(context: "${env.GITHUB_CHECK_ITS_NAME}", description: "${env.GITHUB_CHECK_ITS_NAME} ...", status: 'PENDING', targetUrl: "${env.JENKINS_URL}search/?q=${env.ITS_PIPELINE.replaceAll('/','+')}")
      }
    }
  }
  post {
    cleanup {
      notifyBuildResult()
    }
  }
}

def generateStep(Map params = [:]){
  def version = params?.version
  def tav = params.containsKey('tav') ? params.tav : ''
  def edge = params.containsKey('edge') ? params.edge : false
  return {
    node('docker && linux && immutable'){
      try {
        env.HOME = "${WORKSPACE}"
        deleteDir()
        unstash 'source'
        dir("${BASE_DIR}"){
          retry(2){
            sleep randomNumber(min:10, max: 30)
            if (version?.startsWith('6')) {
              catchError {
                sh(label: 'Run Tests', script: """.ci/scripts/test.sh "${version}" "${tav}" "${edge}" """)
              }
            } else {
              sh(label: "Run Tests", script: """.ci/scripts/test.sh "${version}" "${tav}" "${edge}" """)
            }
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
