# storage-api on Coolify

Read-only HTTP download service for the existing S3 bucket. Webadmin links to:

```
GET /1111/xplatform-apk?name=xplatform-1111.apk
```

This streams `1111/xplatform-apk/xplatform-1111.apk` from
`lotoideal-storage-version`, preserving the download URL, binary content type and
attachment filename. The optional `version` query remains ignored, as in the
running S3 service. Missing `name` uses the object key suffix `app`. No local data
volume is needed. Downloads currently have no authentication; retain the existing
public download contract and limit the S3 credential to the required objects.

## Source recovery

GitHub master stopped at `a46d0737a1d7b28383a9b4a4f2b845b002596a50` and still used
filesystem uploads/versioning. The Kubernetes image `storage-version:v0.0.1-beta`
contains later local commits, ending at `36cc2cdd60f48eaafcc3b2d8e5cb6b698d9bdc46`.
Its Git reflog identifies this repository. The active service only has S3 GET
routes; PUT and `/latest` are absent. This change recovers that active contract,
replaces obsolete filesystem tests/helpers, and compiles a new image from source.
The recovered lib/storage.js SHA-256 was
`ec30921840c6287a6d32cb2895935b96b6b65fe41a68a12c81f90e50c6e57607`.

Credentials formerly loaded from config.json now use the AWS SDK's default
credential provider chain, including EC2 instance roles and optional runtime ENV.
Neither config.json, .env, Git metadata nor credentials enter the image. The
[SDK v3 streaming API](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/migrate-s3.html)
replaces the retired v2 dependency. Missing objects return 404; S3 rejections
retain their HTTP status; stream failures terminate incomplete downloads.
Invalid header filenames return 400 instead of crashing the process.

## Coolify settings

| Setting | Value |
| --- | --- |
| Repository | eduardiazf/storage-version |
| Branch | master after merge |
| Build Pack | Dockerfile |
| Base Directory / Dockerfile Location | / /Dockerfile |
| Application name / Network Aliases | storage-api |
| Network / Ports Exposes | coolify / 8000 |
| Port Mappings / Custom Docker Options | empty |
| Health check | HTTP GET /health, port 8000, expected 200 |
| Volumes | none |
| Auto Deploy | disabled during migration |

Initially leave Domains empty to validate the container. At cutover retain
https://storage.prod.idealoto.cc and https://storage.boletideal.com. Do not move
DNS until a known real object downloads successfully and matches the source.
Coolify must have GitHub access to the personal eduardiazf repository.

Import `.env.example` as runtime-only variables (Available at Buildtime off):

```dotenv
NODE_ENV=production
PORT=8000
AWS_REGION=us-east-1
S3_BUCKET=lotoideal-storage-version
```

For Coolify on EC2, attach an instance profile with `s3:GetObject` limited to the
objects this service must serve. Leave AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
and AWS_SESSION_TOKEN unset; the SDK obtains and refreshes temporary credentials.
The container must be able to reach IMDSv2. Keep tokens required; Docker bridge
networking can require a metadata response hop limit of 2. An instance role can
also be accessed by other processes/containers with metadata access, so it is
not a per-container identity. Restrict its permissions to the downloadable files.
See [AWS role credentials](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/loading-node-credentials-iam.html).

Explicit runtime AWS credentials remain supported by the SDK for other hosting
environments. Mark them sensitive; never make them available at build time.
Remove obsolete or invalid ENV credentials before using the instance role,
because ENV credentials take precedence in the provider chain.

Startup and `/health` check HTTP liveness without querying S3 or requiring static
keys. Verify permissions by downloading a known object and comparing its checksum
before routing users to this service. Builds and CI do not access AWS/ECR or
Kubernetes. CLI --port/--storage are replaced by PORT and S3_BUCKET.

**Historical source failure (2026-10-03):** the credential embedded in the old
Kubernetes image returned `InvalidAccessKeyId`. Do not copy that config/credential
to Coolify; the destination uses its own least-privilege role.

## Validation

```sh
npm ci --ignore-scripts
npm test
docker build --platform linux/amd64 -t storage-api:coolify .
python3 contrib/check-image.py storage-api:coolify
```

Node's test runner exercises HTTP with an injected local S3 stub: binary download,
key/filename mapping, ignored version, default object name, missing/denied objects,
interrupted streams, malformed filenames, and absence of uploads/version listing.
The startup test and image check verify startup without static credentials,
port validation, non-root startup and health without any S3 access. The image
check runs in a network-none container and checks that config/secret
files are absent. CI builds this image and runs both checks; it does not deploy.
Live S3 download/checksum validation must also pass with the deployed role.
