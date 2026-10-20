import { mkdirSync, writeFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const ref = (name) => ({ Ref: name })
const sub = (value) => ({ 'Fn::Sub': value })
const attr = (name, key) => ({ 'Fn::GetAtt': [name, key] })
const bucketArn = attr('SiteBucket', 'Arn')
const distributionArn = sub('arn:${AWS::Partition}:cloudfront::${AWS::AccountId}:distribution/${Distribution}')
const resources = {
  SiteBucket: {
    Type: 'AWS::S3::Bucket', DeletionPolicy: 'Retain', UpdateReplacePolicy: 'Retain',
    Properties: {
      PublicAccessBlockConfiguration: { BlockPublicAcls: true, BlockPublicPolicy: true, IgnorePublicAcls: true, RestrictPublicBuckets: true },
      OwnershipControls: { Rules: [{ ObjectOwnership: 'BucketOwnerEnforced' }] },
      BucketEncryption: { ServerSideEncryptionConfiguration: [{ ServerSideEncryptionByDefault: { SSEAlgorithm: 'AES256' } }] },
      VersioningConfiguration: { Status: 'Enabled' },
      LifecycleConfiguration: { Rules: [{ Id: 'ExpireOldVersions', Status: 'Enabled', NoncurrentVersionExpiration: { NoncurrentDays: 30 }, AbortIncompleteMultipartUpload: { DaysAfterInitiation: 1 } }] },
      Tags: [{ Key: 'Project', Value: 'FinancialSummary' }],
    },
  },
  OriginAccessControl: { Type: 'AWS::CloudFront::OriginAccessControl', Properties: { OriginAccessControlConfig: {
    Name: sub('${AWS::StackName}-s3'), OriginAccessControlOriginType: 's3', SigningBehavior: 'always', SigningProtocol: 'sigv4',
  } } },
  CachePolicy: { Type: 'AWS::CloudFront::CachePolicy', Properties: { CachePolicyConfig: {
    Name: sub('${AWS::StackName}-cache'), MinTTL: 0, DefaultTTL: 300, MaxTTL: 31536000,
    ParametersInCacheKeyAndForwardedToOrigin: { EnableAcceptEncodingGzip: true, EnableAcceptEncodingBrotli: true,
      CookiesConfig: { CookieBehavior: 'none' }, HeadersConfig: { HeaderBehavior: 'none' }, QueryStringsConfig: { QueryStringBehavior: 'none' } },
  } } },
  ResponseHeadersPolicy: { Type: 'AWS::CloudFront::ResponseHeadersPolicy', Properties: { ResponseHeadersPolicyConfig: {
    Name: sub('${AWS::StackName}-headers'), SecurityHeadersConfig: {
      StrictTransportSecurity: { AccessControlMaxAgeSec: 31536000, Override: true },
      ContentTypeOptions: { Override: true }, FrameOptions: { FrameOption: 'DENY', Override: true },
      ReferrerPolicy: { ReferrerPolicy: 'strict-origin-when-cross-origin', Override: true },
      ContentSecurityPolicy: { Override: true, ContentSecurityPolicy: "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'none'" },
    },
  } } },
  Distribution: { Type: 'AWS::CloudFront::Distribution', Properties: { DistributionConfig: {
    Enabled: true, Comment: 'FinancialSummary public demo', DefaultRootObject: 'index.html', PriceClass: 'PriceClass_100', HttpVersion: 'http2and3', IPV6Enabled: true,
    Origins: [{ Id: 'PrivateS3', DomainName: attr('SiteBucket', 'RegionalDomainName'), OriginAccessControlId: ref('OriginAccessControl'), S3OriginConfig: { OriginAccessIdentity: '' } }],
    DefaultCacheBehavior: { TargetOriginId: 'PrivateS3', ViewerProtocolPolicy: 'redirect-to-https', AllowedMethods: ['GET', 'HEAD', 'OPTIONS'], CachedMethods: ['GET', 'HEAD', 'OPTIONS'], Compress: true, CachePolicyId: ref('CachePolicy'), ResponseHeadersPolicyId: ref('ResponseHeadersPolicy') },
    CustomErrorResponses: [403, 404].map((code) => ({ ErrorCode: code, ResponseCode: 404, ResponsePagePath: '/404.html', ErrorCachingMinTTL: 0 })),
    ViewerCertificate: { CloudFrontDefaultCertificate: true },
  }, Tags: [{ Key: 'Project', Value: 'FinancialSummary' }] } },
  BucketPolicy: { Type: 'AWS::S3::BucketPolicy', Properties: { Bucket: ref('SiteBucket'), PolicyDocument: { Version: '2012-10-17', Statement: [
    { Sid: 'DenyInsecureTransport', Effect: 'Deny', Principal: '*', Action: 's3:*', Resource: [bucketArn, sub('${SiteBucket.Arn}/*')], Condition: { Bool: { 'aws:SecureTransport': 'false' } } },
    { Sid: 'AllowCloudFrontOnly', Effect: 'Allow', Principal: { Service: 'cloudfront.amazonaws.com' }, Action: 's3:GetObject', Resource: sub('${SiteBucket.Arn}/*'), Condition: { StringEquals: { 'AWS:SourceArn': distributionArn } } },
  ] } } },
  PublisherRole: { Type: 'AWS::IAM::Role', Properties: {
    Description: 'Publish only the FinancialSummary public demo from GitHub main', MaxSessionDuration: 3600,
    AssumeRolePolicyDocument: { Version: '2012-10-17', Statement: [{ Effect: 'Allow', Action: 'sts:AssumeRoleWithWebIdentity',
      Principal: { Federated: sub('arn:${AWS::Partition}:iam::${AWS::AccountId}:oidc-provider/token.actions.githubusercontent.com') },
      Condition: { StringEquals: { 'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com', 'token.actions.githubusercontent.com:sub': 'repo:catflyx520@71905429/FinancialSummary@1406449727:ref:refs/heads/main' } },
    }] },
    Policies: [{ PolicyName: 'PublishDemo', PolicyDocument: { Version: '2012-10-17', Statement: [
      { Effect: 'Allow', Action: ['s3:ListBucket'], Resource: bucketArn },
      { Effect: 'Allow', Action: ['s3:PutObject'], Resource: sub('${SiteBucket.Arn}/*') },
      { Effect: 'Allow', Action: ['cloudfront:CreateInvalidation', 'cloudfront:GetInvalidation', 'cloudfront:GetDistribution'], Resource: distributionArn },
    ] } }],
  } },
}
const template = { AWSTemplateFormatVersion: '2010-09-09', Description: 'FinancialSummary public demo: private S3, CloudFront OAC, GitHub OIDC publisher. Reuses the existing account OIDC provider.',
  Parameters: {
    PortfolioDistributionId: { Type: 'String', Default: '', AllowedPattern: '^$|^[A-Z0-9]+$', Description: 'Optional existing portfolio CloudFront distribution ID for /financial-summary/. Leave empty to disable.' },
  },
  Conditions: { HasPortfolioDistribution: { 'Fn::Not': [{ 'Fn::Equals': [ref('PortfolioDistributionId'), ''] }] } },
  Resources: resources,
  Outputs: {
    SiteBucketName: { Value: ref('SiteBucket') }, DistributionId: { Value: ref('Distribution') },
    SiteUrl: { Value: sub('https://${Distribution.DomainName}') }, PublisherRoleArn: { Value: attr('PublisherRole', 'Arn') },
  },
}
resources.BucketPolicy.Properties.PolicyDocument.Statement.push({ 'Fn::If': ['HasPortfolioDistribution', {
  Sid: 'AllowPortfolioCloudFrontOnly', Effect: 'Allow', Principal: { Service: 'cloudfront.amazonaws.com' },
  Action: 's3:GetObject', Resource: sub('${SiteBucket.Arn}/*'),
  Condition: { StringEquals: { 'AWS:SourceArn': sub('arn:${AWS::Partition}:cloudfront::${AWS::AccountId}:distribution/${PortfolioDistributionId}') } },
}, ref('AWS::NoValue')] })
// Guard against accidental public buckets, broad publishers, or changes to other projects.
assert.equal(Object.keys(resources).length, 7)
assert.equal(resources.SiteBucket.Properties.PublicAccessBlockConfiguration.BlockPublicPolicy, true)
assert.equal(resources.SiteBucket.DeletionPolicy, 'Retain')
assert.equal(resources.Distribution.Properties.DistributionConfig.Origins[0].S3OriginConfig.OriginAccessIdentity, '')
assert.equal(resources.Distribution.Properties.DistributionConfig.DefaultCacheBehavior.ViewerProtocolPolicy, 'redirect-to-https')
assert.match(resources.PublisherRole.Properties.AssumeRolePolicyDocument.Statement[0].Condition.StringEquals['token.actions.githubusercontent.com:sub'], /FinancialSummary@1406449727:ref:refs\/heads\/main$/)
assert.ok(!Object.values(resources).some((r) => ['AWS::IAM::OIDCProvider', 'AWS::Budgets::Budget'].includes(r.Type)))
assert.ok(resources.PublisherRole.Properties.Policies[0].PolicyDocument.Statement.every((s) => s.Resource !== '*'))
const json = JSON.stringify(template, null, 2) + '\n'
assert.ok(Buffer.byteLength(json) < 51200)
mkdirSync('deployment', { recursive: true })
writeFileSync('deployment/FinancialSummaryHosting.template.json', json)
console.log(`Standalone CloudFormation template prepared and checked (${Buffer.byteLength(json)} bytes).`)
