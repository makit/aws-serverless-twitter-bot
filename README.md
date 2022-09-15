# AWS Serverless Event Driven Twitter Bot
A AWS Cloud Native application using CDK (Written in TypeScript) that defines an deploys a Serverless Event Driven application for interacting with Twitter and utilising Machine Learning / AI as a Service.

## Utilised AWS Services
* AWS Identity and Access Management (IAM)
* AWS Lambda
* AWS Secrets Manager
* AWS Step Functions
* Amazon API Gateway
* Amazon CloudWatch
* Amazon Comprehend
* Amazon EventBridge
* Amazon Kinesis Data Firehose
* Amazon Lex
* Amazon Rekognition
* Amazon S3
* Amazon Simple Notification Service (SNS)

## Building and Deploying

### CDK Deploy
If not already setup for CDK then you will need:
* [AWS CLI](https://aws.amazon.com/cli/) installed and your workstation [configured](https://docs.aws.amazon.com/cdk/v2/guide/getting_started.html) to the correct account: `aws configure`
* [Node & NPM](https://nodejs.org/en/about/releases/) installed
* CDK installed globally: `npm install -g aws-cdk`
  * This can be verified by running `cdk --version`

Within the root of this application you should be able to then run a `npm install` to restore the dependencies.

Once installed, then you can run `cdk deploy --all` to build and deploy all stacks to your default AWS account/region. For other CDK commands then check [documention](https://docs.aws.amazon.com/cdk/v2/guide/cli.html).

The API Gateway URL should be output to the console as part of the deployment, but may be hard to find in the output - it will look something like:
`IngressStack.APIGateway = https://99dd9d9dd.execute-api.eu-west-1.amazonaws.com/prod/`

If you cannot find it, then navigate to [API Gateway](https://eu-west-1.console.aws.amazon.com/apigateway/main/apis) in your console and you should have an API called `ingress-api` - if you navigate to this and then Stages and `prod` you can see the url there.

### Twitter Developer Account
The application is reactive to webhooks from Twitter utilising the [Account Activity API](https://developer.twitter.com/en/docs/twitter-api/premium/account-activity-api/overview). For this a Developer Account is needed.

1. Sign up for a [Twitter Developer Account](https://developer.twitter.com/en/apply-for-access)
2. Apply for [Elevated Access](https://developer.twitter.com/en/portal/products/elevated)
3. Create an [Application](https://developer.twitter.com/en/portal/projects-and-apps) and grab all the API Keys/Secrets, Auth Tokens, etc.
4. Follow the `Twitter Secrets` below to add these details to your AWS account.
5. Create a Dev Environment for that application to use the Account Activity API.
6. Register a Webhook with the `https://api.twitter.com/1.1/account_activity/all/{{environment}}/webhooks.json?url={{your_api_gateway_url}}/prod/twitter` API. More details in the[Twitter API Doc](https://developer.twitter.com/en/docs/twitter-api/premium/account-activity-api/api-reference).
7. Register a [subscription for the account](https://developer.twitter.com/en/docs/twitter-api/premium/account-activity-api/api-reference/aaa-premium#post-account-activity-all-env-name-subscriptions). More details in the [Twitter API Doc](https://developer.twitter.com/en/docs/twitter-api/premium/account-activity-api/api-reference).

Once a webhook is registered then an API call will be made to the API Gateway to verify, this can be seen in the logs for the `IngressStack-TwitterActivitylambda` lambda for debugging.

### Twitter Secrets
Create a Secret in Secret Manager manually in the correct AWS account and region with the name `TwitterSecret` and value of the below. (In the UI this is added as a Key/value pair or plaintext of the raw JSON like below):

```
{
  ApiKey: 'TODO',
  ApiSecret: 'TODO',
  AccessToken: 'TODO,
  AccessTokenSecret: 'TODO'
}
```

## Event Types
Twitter lists all of the types that could be sent to the endpoint: https://developer.twitter.com/en/docs/twitter-api/enterprise/account-activity-api/guides/account-activity-data-objects

## Flow
TODO