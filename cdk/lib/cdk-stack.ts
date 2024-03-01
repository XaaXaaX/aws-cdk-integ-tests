import { Aspects, Duration, RemovalPolicy, Stack, StackProps, Tags } from 'aws-cdk-lib';
import { AttributeType, BillingMode, ITable, Table } from 'aws-cdk-lib/aws-dynamodb';
import { ManagedPolicy, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { IQueue, Queue } from 'aws-cdk-lib/aws-sqs';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { resolve } from 'path';
import { ApplyDestroyPolicyAspect } from '../helpers/stack';

export interface ExampleAppStackProps extends StackProps {
  forceDestroyPolicy?: boolean;
  environment: string;
  stackEnv?: string;
  application?: string;
  isTestStack?: string;
}
export class ExampleAppStack extends Stack {
  readonly Queue: IQueue;
  readonly Table: ITable;
  constructor(scope: Construct, id: string, props: ExampleAppStackProps) {
    super(scope, id, props);

    Tags.of(this).add('env', props?.stackEnv ?? props.environment ?? 'dev');
    Tags.of(this).add('app', props?.application ?? 'example-app');
    Tags.of(this).add('isTestStack', props?.isTestStack ?? 'false');

    const functionRole = new Role(this, 'AddRole', {
      assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')
      ]
    });

    const deadLetterQueue = new Queue(this, 'DeadLetterQueue', {
      visibilityTimeout: Duration.seconds(30),
    });

    this.Queue = new Queue(this, 'Queue', {
      visibilityTimeout: Duration.seconds(30),
      deadLetterQueue: {
        maxReceiveCount: 3,
        queue: deadLetterQueue
      },
    });

    this.Table = new Table(this, 'articles-table', {
      billingMode: BillingMode.PAY_PER_REQUEST,
      partitionKey: { name: 'id', type: AttributeType.STRING },
      removalPolicy: RemovalPolicy.DESTROY
    });

    const functionName =  `${this.stackName}-CreateItemHandlerFunction`;
    const itemHandlerLogGroup = new LogGroup(this, 'ItemHandlerLogGroup', {
      retention: RetentionDays.ONE_DAY,
      logGroupName: `/aws/lambda/${functionName}`
    });

    const itemHandlerFunction = new NodejsFunction(this, 'CreateItemHandlerFunction', {
      functionName,
      runtime: Runtime.NODEJS_20_X,
      role: functionRole,
      logGroup: itemHandlerLogGroup,
      entry:  resolve(__dirname, '../../src/item-handler.ts'),
      handler: 'index.handler',
      environment: {
        ITEM_TABLE_NAME: this.Table.tableName,
      },
    });

    itemHandlerFunction.addEventSource(new SqsEventSource(this.Queue));
    
    new StringParameter(this, 'ItemHandlerQueueArnParam', {
      parameterName: '/item-example/queue/arn',
      stringValue: this.Queue.queueArn,
    });

    new StringParameter(this, 'ItemHandlerQueueUrlParam', {
      parameterName: '/item-example/queue/url',
      stringValue: this.Queue.queueUrl,
    });

    new StringParameter(this, 'ItemHandlerTableNameParam', {
      parameterName: '/item-example/table/name',
      stringValue: this.Table.tableName,
    });

    this.Table.grantReadWriteData(functionRole);
    this.Queue.grantConsumeMessages(functionRole);
    deadLetterQueue.grantSendMessages(functionRole);

    if (props?.forceDestroyPolicy) {
      Aspects.of(this).add(new ApplyDestroyPolicyAspect());
    }
  }
}

