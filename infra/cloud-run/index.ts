import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import * as gcp from '@pulumi/gcp'
import * as pulumi from '@pulumi/pulumi'

// The spider worker as a Cloud Run job, one execution per task (.plan/spider-worker-cloud-run.md). Brain starts the executions
// (CLOUD_RUN_JOB); RabbitMQ stays on GKE behind an internal address that this stack reserves. Secret values are not set here:
// the CD writes them with `gcloud secrets versions add`, so they never reach the state.

const config = new pulumi.Config('automatedlinkedin-cloud-run')
const gcpConfig = new pulumi.Config('gcp')
const project = gcpConfig.require('project')
const region = gcpConfig.require('region')
const imageTag = config.require('imageTag')
const bucket = config.require('bucket')
const allowedHosts = config.require('allowedHosts')
const robotsExemptHosts = config.require('robotsExemptHosts')
const rabbitmqAddress = config.require('rabbitmqAddress')
const brainServiceAccount = config.require('brainServiceAccount')

// The settings every worker shares, from the file Kubernetes uses too.
const sharedSettings = (): Record<string, string> => {
   const file = join(__dirname, '..', '..', '..', 'deploy', 'components', 'spider', 'spider.config.env')
   const lines = readFileSync(file, 'utf8').split('\n')

   return Object.fromEntries(
      lines
         .map(line => line.trim())
         .filter(line => line !== '' && !line.startsWith('#'))
         .map(line => {
            const index = line.indexOf('=')

            return [line.slice(0, index), line.slice(index + 1)]
         })
   )
}

const workerServiceAccount = `spider-worker-gcs@${project}.iam.gserviceaccount.com`
const network = `projects/${project}/global/networks/default`
const subnetwork = `projects/${project}/regions/${region}/subnetworks/default`

// The Artifact Registry repository already exists (the spike pushed to it), so it is adopted rather than created.
const repository = new gcp.artifactregistry.Repository(
   'spider',
   {
      repositoryId: 'spider',
      location: region,
      format: 'DOCKER',
      description: 'spider worker images',
   },
   { import: `projects/${project}/locations/${region}/repositories/spider` }
)

// RabbitMQ's internal address. GKE's Service asks for it by name (deploy/overlays/staging).
const rabbitmqInternal = new gcp.compute.Address('rabbitmq-internal', {
   name: 'rabbitmq-internal',
   region,
   addressType: 'INTERNAL',
   purpose: 'GCE_ENDPOINT',
   address: rabbitmqAddress,
   subnetwork,
})

const secretNames = {
   rabbitmqUrl: 'spider-worker-rabbitmq-url',
   credentialKey: 'spider-worker-linkedin-cred-enc-key',
}

const secrets = Object.fromEntries(
   Object.entries(secretNames).map(([key, secretId]) => [
      key,
      new gcp.secretmanager.Secret(secretId, {
         secretId,
         replication: { auto: {} },
      }),
   ])
)

Object.entries(secrets).forEach(([key, secret]) =>
   new gcp.secretmanager.SecretIamMember(`${key}-reader`, {
      secretId: secret.secretId,
      role: 'roles/secretmanager.secretAccessor',
      member: `serviceAccount:${workerServiceAccount}`,
   })
)

const job = new gcp.cloudrunv2.Job(
   'spider-worker',
   {
      name: 'spider-worker',
      location: region,
      deletionProtection: true,
      template: {
         taskCount: 1,
         parallelism: 1,
         template: {
            serviceAccount: workerServiceAccount,
            timeout: '1800s',
            maxRetries: 0,
            executionEnvironment: 'EXECUTION_ENVIRONMENT_GEN2',
            vpcAccess: {
               egress: 'PRIVATE_RANGES_ONLY',
               networkInterfaces: [{ network, subnetwork }],
            },
            containers: [
               {
                  image: `${region}-docker.pkg.dev/${project}/spider/spider-worker:${imageTag}`,
                  resources: {
                     limits: {
                        cpu: '2',
                        memory: '8Gi',
                     },
                  },
                  envs: [
                     ...Object.entries({
                        ...sharedSettings(),
                        NODE_ENV: 'production',
                        SPIDER_RUN_ONCE: 'true',
                        SPIDER_HEADLESS: 'virtual',
                        SPIDER_RECORDING: 'always',
                        SPIDER_GCS_BUCKET: bucket,
                        SPIDER_ALLOWED_HOSTS: allowedHosts,
                        SPIDER_ROBOTS_EXEMPT_HOSTS: robotsExemptHosts,
                        SPIDER_SHUTDOWN_GRACE_MS: '5000',
                     }).map(([name, value]) => ({ name, value })),
                     {
                        name: 'RABBITMQ_URL',
                        valueSource: {
                           secretKeyRef: { secret: secrets.rabbitmqUrl.secretId, version: 'latest' },
                        },
                     },
                     {
                        name: 'LINKEDIN_CRED_ENC_KEY',
                        valueSource: {
                           secretKeyRef: { secret: secrets.credentialKey.secretId, version: 'latest' },
                        },
                     },
                  ],
               },
            ],
         },
      },
   },
   { dependsOn: [repository, rabbitmqInternal] }
)

// Brain starts the job with its own role, which can start and read this one job and nothing else. The role was created by hand
// for the spike; it is adopted here so it is not created twice (a deleted custom role keeps its name for days).
const launcherRole = new gcp.projects.IAMCustomRole(
   'spiderJobLauncher',
   {
      roleId: 'spiderJobLauncher',
      title: 'Spider job launcher',
      description: 'Start and read the spider worker Cloud Run job (brain)',
      permissions: ['run.jobs.get', 'run.jobs.run', 'run.executions.get', 'run.executions.list'],
      stage: 'GA',
   },
   { import: `projects/${project}/roles/spiderJobLauncher` }
)

new gcp.cloudrunv2.JobIamMember('brain-launches-spider-worker', {
   project,
   location: region,
   name: job.name,
   role: launcherRole.name,
   member: `serviceAccount:${brainServiceAccount}`,
})

// The smart shutdown checker (deploy/overlays/staging/idle-shutdown) acts as staging-power. It only reads the job's executions, so
// it can keep the node pool on while a run is going (.plan/spider-worker-cloud-run.md, step 7).
const watcherRole = new gcp.projects.IAMCustomRole('spiderJobWatcher', {
   roleId: 'spiderJobWatcher',
   title: 'Spider job watcher',
   description: 'List the executions of the spider worker Cloud Run job (smart shutdown)',
   permissions: ['run.executions.list'],
   stage: 'GA',
})

new gcp.cloudrunv2.JobIamMember('smart-shutdown-watches-spider-worker', {
   project,
   location: region,
   name: job.name,
   role: watcherRole.name,
   member: `serviceAccount:staging-power@${project}.iam.gserviceaccount.com`,
})

export const jobName = pulumi.interpolate`projects/${project}/locations/${region}/jobs/${job.name}`
export const imageRepository = `${region}-docker.pkg.dev/${project}/spider/spider-worker`
export const rabbitmqInternalAddress = rabbitmqInternal.address
