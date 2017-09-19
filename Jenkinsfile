#!groovy
def nodejs_versions = ['8','7.9.0','6', '5', '4', '0.10', '0.12']
def test_jobs = [:]
def tav_nodejs_versions = ['8','7','6', '5', '4', '0.10', '0.12']
def tav_envs = ['generic-pool,mysql,redis,koa-router','ioredis,pg','bluebird','knex,ws,graphql,express-graphql,elasticsearch']
def tav_jobs = [:]

properties([pipelineTriggers([githubPush()])])

node{
    git url: 'https://github.com/elastic/apm-agent-nodejs.git', branch: 'master'
    withEnv(["HOME=/var/lib/jenkins"
             ]) {
        stage('Checkout'){
            node('linux'){
                sh 'echo "do some SCM checkout..."'
                checkout scm
            }
        }

        stage('Tests'){
            test_jobs['docs'] = {
                node('linux'){
                    checkout scm
                    dir('src/github.com/elastic/apm-agent-nodejs/'){
                        sh("./test/script/docker/cleanup.sh")
                        sh("./test/script/docker/run_docs.sh")
                    }
                }
            }
            for (int i=0; i<nodejs_versions.size(); i++){
                def nodejs_version = nodejs_versions[i]
                test_jobs[nodejs_version] = {
                    node('linux'){
                        checkout scm
                        dir('src/github.com/elastic/apm-agent-nodejs/'){
                            sh("./test/script/docker/cleanup.sh")
                            sh("./test/script/docker/run_tests.sh ${nodejs_version}")
                        }
                    }
                }
            }
            parallel test_jobs
        }

        stage("Dependencies"){
            for (int i=0; i<tav_nodejs_versions.size(); i++){
                def nodejs_version = tav_nodejs_versions[i]
                for (int j=0; j<tav_envs.size(); j++){
                    def environment = tav_envs[j] 
                    def job = "${nodejs_version}_${environment}".toString()
                    tav_jobs[job] = {
                        node('linux'){
                            checkout scm
                            dir('src/github.com/elastic/apm-agent-nodejs/'){
                                sh("./test/script/docker/cleanup.sh")
                                sh("./test/script/docker/run_tests.sh ${nodejs_version} ${environment}")
                            }
                        }
                    }
                }
            }
            parallel tav_jobs
        }
    }
}
