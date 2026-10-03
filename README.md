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

Credentials formerly loaded from config.json are now runtime AWS variables.
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
AWS_ACCESS_KEY_ID=REPLACE_WITH_VALID_S3_ACCESS_KEY
AWS_SECRET_ACCESS_KEY=REPLACE_WITH_VALID_S3_SECRET_KEY
S3_BUCKET=lotoideal-storage-version
```

Mark AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY sensitive. For temporary
credentials also supply AWS_SESSION_TOKEN. These credentials read S3 objects;
builds and CI do not access AWS/ECR or Kubernetes. Startup requires the two key
variables but does not validate their permissions. `/health` checks HTTP liveness
without querying S3. CLI --port/--storage are replaced by PORT and S3_BUCKET.

**Current cutover blocker (2026-10-03):** the embedded source credential returns
`InvalidAccessKeyId` (HTTP 403). The existing Kubernetes download linked by
webadmin returns HTTP 500. Supply a valid credential with s3:GetObject on the
required bucket paths and revalidate the APK; no bucket or IAM permissions have
been changed. A healthy container alone does not resolve this source failure.

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
The image check verifies credential guards, non-root startup and health in a
network-none container with synthetic credentials. It checks that config/secret
files are absent. CI builds this image and runs both checks; it does not deploy.
Live S3 download/checksum validation remains pending a working credential.
