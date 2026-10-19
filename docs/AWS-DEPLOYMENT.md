# FinancialSummary public demo on AWS

Status: deployed and verified on October 18, 2026 (America/Los_Angeles).

**[Live demo](https://dylyqx4np8ne0.cloudfront.net)** · [Successful publishing workflow](https://github.com/catflyx520/FinancialSummary/actions/runs/39201052385)

The user created `FinancialSummaryHosting` in the AWS console. GitHub Actions published application commit `7c9ba62cdeb2d2cf58c8ee3c2c4728db4ad03af1` to distribution `E2Y5P5O9RUKH49` and bucket `financialsummaryhosting-sitebucket-jrikfmty7nxa` using temporary OIDC credentials.

Verified: 144 tests, lint, demo build, CloudFormation lint, HTML/CSS/JavaScript and PDF-worker MIME types, HTTPS redirect, custom 404, security headers, and anonymous direct-S3 denial. Browser checks covered all five workspace pages, adding a fictional transaction, resetting the demo, and switching languages. PDF import with a live uploaded statement and mobile-device interaction were not exercised in this deployment check.

The instructions below describe how to recreate the stack or publish an update. The existing stack does not need to be created again.

This static React application needs no server, database, bank connection, or Firebase for the public demo. It uses fictional data in memory. Refreshing or choosing **Restart demo** resets edits. A saved language preference is allowed; the demo never loads the local personal ledger.

## 1. Create the independent stack in the AWS console

Use account `397303793146`, region **US East (Ohio), us-east-2**. The existing account GitHub OIDC provider must remain in place. This template reuses it; it does not create another provider or another budget.

1. Open [CloudFormation in Ohio](https://us-east-2.console.aws.amazon.com/cloudformation/home?region=us-east-2#/stacks/create/template).
2. Choose **Create stack → With new resources (standard)**.
3. Choose **Upload a template file**, then select `deployment/FinancialSummaryHosting.template.json` from this repository.
4. Set **Stack name** to `FinancialSummaryHosting`. There are no parameters to fill in.
5. Keep the default stack options. On the review page, acknowledge that CloudFormation may create IAM resources. The publisher role is restricted to this repository's main branch, this bucket, and this distribution.
6. Choose **Submit / Create stack** yourself. Wait for **CREATE_COMPLETE**.
7. Open **Outputs** and copy these four values: `SiteBucketName`, `DistributionId`, `SiteUrl`, `PublisherRoleArn`.

The URL will not serve the application until the publishing step finishes. An initial 404 before upload is expected.

## 2. Configure the GitHub publishing workflow

Repository: `catflyx520/FinancialSummary`. In **Settings → Secrets and variables → Actions → Variables**, create:

| Repository variable | CloudFormation output |
| --- | --- |
| `DEMO_SITE_BUCKET` | `SiteBucketName` |
| `DEMO_DISTRIBUTION_ID` | `DistributionId` |
| `DEMO_SITE_URL` | `SiteUrl` |
| `DEMO_PUBLISH_ROLE_ARN` | `PublisherRoleArn` |

These are resource identifiers, not credentials. Do not add AWS access keys, Root keys, or Firebase credentials.

Go to **Actions → Build and publish public demo → Run workflow**. Select `main` and enable **Publish to the existing FinancialSummary AWS stack**. Leaving it disabled only builds downloadable artifacts. The workflow obtains temporary AWS credentials through OIDC, uploads files, waits for CloudFront invalidation, and verifies the release and 404 status. It does not create infrastructure.

The IAM trust uses GitHub's currently configured immutable subject:

```text
repo:catflyx520@71905429/FinancialSummary@1406449727:ref:refs/heads/main
```

If the repository is transferred or its OIDC subject settings change, update the trust deliberately. Pull requests and other branches cannot publish.

## 3. Verify the live demo

- Open `SiteUrl` in a fresh browser: English demo, fictional balances, no login required.
- Navigate through Transactions, Accounts, Recurring payments, and Settings.
- Add or edit a sample entry, then choose **Restart demo**: changes reset.
- Switch between Chinese and English. Check a narrow mobile window.
- Confirm `/release.json` shows the deployed commit, `mode: public-demo`, and `cloudEnabled: false`.
- A nonexistent path must return 404. CloudFront uses a private S3 REST origin with OAC; the bucket is never public.
- Add the verified URL to the portfolio only after these checks pass.

## Local build and structure

Use Node.js 24. From the repository root:

```sh
npm ci
npm run lint
npm test -- --run
npm run prepare:hosting
npm run build:demo
npm run preview
```

`npm ci` installs exactly the versions in the lockfile. `npm install` is also appropriate when intentionally updating dependencies; commit the resulting lockfile changes.

```text
.github/workflows/publish-demo.yml       build and optional AWS publish
deployment/FinancialSummaryHosting.template.json  standalone console template
deployment/404.html                     missing-page response
scripts/prepare-hosting.mjs              generate and check the template
scripts/build-demo.mjs                   force demo mode and empty Firebase config
scripts/publish-demo.py                 upload, invalidate, verify
src/lib/runtime.ts                      public-demo flag
src/app/PublicDemo.test.tsx              personal-ledger isolation check
src/lib/firebase.demo.test.ts            cloud-disabled check
dist/                                   generated website (ignored)
```

`npm run build` remains the personal/local app build. Publish only `npm run build:demo` output through this workflow. The demo builder overrides all six Firebase configuration values, including values present in local environment files. The CloudFront content policy restricts network connections to the site's own origin.

## Operation and costs

S3 storage/requests and CloudFront traffic may incur usage charges. There is no running EC2 instance, NAT gateway, database, custom domain, or purchased CloudFront subscription in this template. Free-tier eligibility and the existing account budget do not guarantee zero charges or impose a spending cap. Resource prices depend on usage: see [CloudFront pricing](https://aws.amazon.com/cloudfront/pricing/) and [S3 pricing](https://aws.amazon.com/s3/pricing/).

The bucket retains data when the stack is deleted. Noncurrent object versions expire after 30 days. Publishing keeps old hashed assets for existing browser sessions; inspect storage periodically. Roll back by running the workflow for a reviewed main-branch revert. Do not delete the account OIDC provider: other projects use it.

The existing dependency audit currently reports issues in development tooling and the Firebase Node dependency chain. Firebase is disabled in this static public demo; this work does not certify the optional cloud-ledger deployment. The build also reports an existing large-chunk warning.

AWS references: [private S3 origins with OAC](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html), [GitHub OIDC role setup](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_providers_create_oidc.html).
