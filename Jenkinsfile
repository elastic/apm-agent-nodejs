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
    issueCommentTrigger('(?i).*(?:jenkins\\W+)?run\\W+(?:the\\W+)?(?:module\\W+)?tests(?:\\W+please)?.*')
  }
  parameters {
    booleanParam(name: 'Run_As_Master_Branch', defaultValue: false, description: 'Allow to run any steps on a PR, some steps normally only run on master branch.')
    booleanParam(name: 'bench_ci', defaultValue: true, description: 'Enable benchmarks.')
    booleanParam(name: 'tav_ci', defaultValue: true, description: 'Enable TAV tests.')
    booleanParam(name: 'tests_ci', defaultValue: true, description: 'Enable tests.')
    booleanParam(name: 'test_edge_ci', defaultValue: true, description: 'Enable tests for edge versions of nodejs.')
  }
  stages {
    /**
    Checkout the code and stash it, to use it on other stages.
    */
    stage('Checkout') {
      agent { label 'immutable' }
      options { skipDefaultCheckout() }
      steps {
        deleteDir()
        gitCheckout(basedir: "${BASE_DIR}", githubNotifyFirstTimeContributor: true)
        stash allowEmpty: true, name: 'source', useDefaultExcludes: false
        script {
          dir("${BASE_DIR}"){
            def regexps =[
              "^lib/instrumentation/modules/",
              "^test/instrumentation/modules/"
            ]
            env.TAV_UPDATED = isGitRegionMatch(regexps: regexps)
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
              def parallelTasksWithoutAsyncHooks = [:]
              node['NODEJS_VERSION'].each{ version ->
                parallelTasks["Node.js-${version}"] = generateStep(version: version)
                parallelTasks["Node.js-${version}-async-hooks-false"] = generateStep(version: version, disableAsyncHooks: true)
                parallelTasks["Windows-Node.js-${version}"] = generateStepForWindows(version: version)
              }

              // PRs don't require to run here as it's now managed within the linting pipeline
              if (!env.CHANGE_ID) {
                // Linting in parallel with the test stage
                parallelTasks['linting'] = linting()
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
            expression { return env.TAV_UPDATED != "false" }
          }
          expression { return params.tav_ci }
        }
      }
      steps {
        deleteDir()
        unstash 'source'
        dir("${BASE_DIR}"){
          script {
            def tavContext = getSmartTAVContext()
            withGithubNotify(context: tavContext.ghContextName, description: tavContext.ghDescription, tab: 'tests') {
              def parallelTasks = [:]
              tavContext.node['NODEJS_VERSION'].each{ version ->
                tavContext.tav['TAV'].each{ tav_item ->
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
      parallel {
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
                  def node = readYaml(file: '.ci/.jenkins_nightly_nodejs.yml')
                  def parallelTasks = [:]
                  node['NODEJS_VERSION'].each { version ->
                    parallelTasks["Node.js-${version}-nightly"] = generateStep(version: version, edge: true)
                  }
                  parallel(parallelTasks)
                }
              }
            }
          }
        }
        stage('Nightly Test - No async hooks') {
          agent { label 'docker && immutable' }
          environment {
            NVM_NODEJS_ORG_MIRROR = "https://nodejs.org/download/nightly/"
          }
          steps {
            withGithubNotify(context: 'Nightly No Async Hooks Test', tab: 'tests') {
              deleteDir()
              unstash 'source'
              dir("${BASE_DIR}"){
                script {
                  def node = readYaml(file: '.ci/.jenkins_nightly_nodejs.yml')
                  def parallelTasks = [:]
                  node['NODEJS_VERSION'].each { version ->
                    parallelTasks["Node.js-${version}-nightly-no-async-hooks"] = generateStep(version: version, edge: true, disableAsyncHooks: true)
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
                  def node = readYaml(file: '.ci/.jenkins_rc_nodejs.yml')
                  def parallelTasks = [:]
                  node['NODEJS_VERSION'].each { version ->
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
          }
          steps {
            withGithubNotify(context: 'RC No Async Hooks Test', tab: 'tests') {
              deleteDir()
              unstash 'source'
              dir("${BASE_DIR}"){
                script {
                  def node = readYaml(file: '.ci/.jenkins_rc_nodejs.yml')
                  def parallelTasks = [:]
                  node['NODEJS_VERSION'].each { version ->
                    parallelTasks["Node.js-${version}-rc-no-async-hooks"] = generateStep(version: version, edge: true, disableAsyncHooks: true)
                  }
                  parallel(parallelTasks)
                }
              }
            }
          }
        }
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
    /**
      Run the benchmarks and store the results on ES.
      The result JSON files are also archive into Jenkins.
    */
    stage('Benchmarks') {
      agent { label 'metal' }
      options { skipDefaultCheckout() }
      environment {
        HOME = "${env.WORKSPACE}"
        RESULT_FILE = 'apm-agent-benchmark-results.json'
        NODE_VERSION = '12'
      }
      when {
        beforeAgent true
        allOf {
          anyOf {
            branch 'master'
            tag pattern: 'v\\d+\\.\\d+\\.\\d+.*', comparator: 'REGEXP'
            expression { return params.Run_As_Master_Branch }
          }
          expression { return params.bench_ci }
        }
      }
      steps {
        withGithubNotify(context: 'Benchmarks', tab: 'artifacts') {
          dir(env.BUILD_NUMBER) {
            deleteDir()
            unstash 'source'
            dir(BASE_DIR){
              sh '.ci/scripts/run-benchmarks.sh "${RESULT_FILE}"'
            }
          }
        }
      }
      post {
        always {
          catchError(message: 'sendBenchmarks failed', buildResult: 'FAILURE') {
            sendBenchmarks(file: "${BUILD_NUMBER}/${BASE_DIR}/${RESULT_FILE}",
                           index: 'benchmark-nodejs', archive: true)
          }
          catchError(message: 'deleteDir failed', buildResult: 'SUCCESS', stageResult: 'UNSTABLE') {
            deleteDir()
          }
        }
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
  def disableAsyncHooks = params.get('disableAsyncHooks', false)
  return {
    node('docker && linux && immutable'){
      try {
        env.HOME = "${WORKSPACE}"
        if (disableAsyncHooks) {
          env.ELASTIC_APM_ASYNC_HOOKS = 'false'
        }
        deleteDir()
        unstash 'source'
        dir("${BASE_DIR}"){
          retry(2){
            sleep randomNumber(min:10, max: 30)
            sh(label: "Run Tests", script: """.ci/scripts/test.sh "${version}" "${tav}" "${edge}" """)
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

/**
* Gather the TAV context for the current execution. Then the TAV stage will execute
* the TAV using a smarter approach.
*/
def getSmartTAVContext() {
   context = [:]
   context.ghContextName = 'TAV Test'
   context.ghDescription = context.ghContextName
   context.node = readYaml(file: '.ci/.jenkins_tav_nodejs.yml')

   // Hard to debug what's going on as there are a few nested conditions. Let's then add more verbose output
   echo """\
   env.GITHUB_COMMENT=${env.GITHUB_COMMENT}
   params.Run_As_Master_Branch=${params.Run_As_Master_Branch}
   env.CHANGE_ID=${env.CHANGE_ID}
   env.TAV_UPDATED=${env.TAV_UPDATED}""".stripIndent()

   if (env.GITHUB_COMMENT) {
     def modules = getModulesFromCommentTrigger(regex: '(?i).*(?:jenkins\\W+)?run\\W+(?:the\\W+)?module\\W+tests\\W+for\\W+(.+)')
     if (modules.isEmpty()) {
       context.ghDescription = 'TAV Test disabled'
       context.tav = readYaml(text: 'TAV:')
       context.node = readYaml(text: 'NODEJS_VERSION:')
     } else {
       if (modules.find{ it == 'ALL' }) {
         context.tav = readYaml(file: '.ci/.jenkins_tav.yml')
       } else {
         context.ghContextName = 'TAV Test Subset'
         context.ghDescription = 'TAV Test comment-triggered'
         context.tav = readYaml(text: """TAV:${modules.collect{ it.replaceAll('"', '').replaceAll("'", '') }.collect{ "\n  - '${it}'"}.join("") }""")
       }
     }
   } else if (params.Run_As_Master_Branch) {
     context.ghDescription = 'TAV Test param-triggered'
     context.tav = readYaml(file: '.ci/.jenkins_tav.yml')
   } else if (env.CHANGE_ID && env.TAV_UPDATED != "false") {
     context.ghContextName = 'TAV Test Subset'
     context.ghDescription = 'TAV Test changes-triggered'
     sh '.ci/scripts/get_tav.sh .ci/.jenkins_generated_tav.yml'
     context.tav = readYaml(file: '.ci/.jenkins_generated_tav.yml')
   } else {
     context.ghDescription = 'TAV Test disabled'
     context.tav = readYaml(text: 'TAV:')
     context.node = readYaml(text: 'NODEJS_VERSION:')
   }
   return context
 }

 def linting(){
   return {
    node('docker && linux && immutable') {
      catchError(stageResult: 'UNSTABLE', message: 'Linting failures') {
        withGithubNotify(context: 'Linting') {
          deleteDir()
          unstash 'source'
          script {
            docker.image('node:12').inside("-v ${WORKSPACE}/${BASE_DIR}:/app"){
              sh(label: 'Basic tests I', script: 'cd /app && .ci/scripts/test_basic.sh')
              sh(label: 'Basic tests II', script: 'cd /app && .ci/scripts/test_types_babel_esm.sh')
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
        env.JAVA_HOME = 'C:\\jdk8'
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
