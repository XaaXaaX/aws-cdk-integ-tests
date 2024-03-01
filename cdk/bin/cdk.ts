#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { ExampleAppStack } from '../lib/cdk-stack';


const app = new cdk.App();
const env = app.node.tryGetContext('env');

new ExampleAppStack(app, 'CdkStack', {
  forceDestroyPolicy: true,
  environment: env
});