#!/usr/bin/env node
import 'source-map-support/register';
import { ExpectedResult, IntegTest } from "@aws-cdk/integ-tests-alpha";
import { App, Aspects, Duration, Tags } from 'aws-cdk-lib';
import { RequireApproval } from 'aws-cdk-lib/cloud-assembly-schema';
import { ExampleAppStack } from '../lib/cdk-stack';
import { marshall } from '@aws-sdk/util-dynamodb';
import { ApplyDestroyPolicyAspect } from '../helpers/stack';

const app = new App();
const params = {
	environment: 'dev',
  stackEnv: "integ-test",
	application: 'example-app',
  isTestStack: 'true'
};

const STACK_UNDER_TEST = new ExampleAppStack(app, ExampleAppStack.name , {
  ...params,
  forceDestroyPolicy: true,
});

const test =  new IntegTest(app, 'integ-test-cdk', {
  testCases: [ STACK_UNDER_TEST ],
  cdkCommandOptions: {
    deploy: { args: { requireApproval: RequireApproval.NEVER } },
    destroy: { args: { force: true } },
  }
})

const eventExample = {
  id: '123456',
  type: 'item.created',
  reference: 'RF_PRD_123',
  time: new Date().toISOString()
}
const testFlow = test.assertions.awsApiCall('SQS', 'sendMessage', {
  QueueUrl: STACK_UNDER_TEST.Queue.queueUrl,
  MessageBody: JSON.stringify(eventExample)
}).next(
  test.assertions
    .awsApiCall('DynamoDB', 'getItem', {
      TableName: STACK_UNDER_TEST.Table.tableName,
      Key: { id: { S: eventExample.id } },
    })
    .expect(
      ExpectedResult.objectLike({ Item: marshall(eventExample) }),
    )
    .waitForAssertions({
      totalTimeout: Duration.seconds(25),
      interval: Duration.seconds(3),
    }),
);

Aspects.of(app).add(
  new ApplyDestroyPolicyAspect());

app.synth();