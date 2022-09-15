#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { PlumbingStack } from '../lib/stacks/plumbing-stack';
import { IngressStack } from '../lib/stacks/ingress-stack';
import { AnalysisStack } from '../lib/stacks/analysis-stack';
import { AlertingStack } from '../lib/stacks/alerting-stack';
import { AnalyticsStack } from '../lib/stacks/analytics-stack';
import { RespondingStack } from '../lib/stacks/responding-stack';
import { EgressStack } from '../lib/stacks/egress-stack';

const app = new cdk.App();

// Read from context
const twitterIdOfAccount = app.node.tryGetContext('twitterAccountId');

if (!twitterIdOfAccount) {
  throw new Error('Missing twitterAccountId context param');
}

const plumbingStack = new PlumbingStack(app, 'PlumbingStack', {});

new IngressStack(app, 'IngressStack', { plumbingEventBus: plumbingStack.eventBus, twitterIdOfAccount });

const analysisStack = new AnalysisStack(app, 'AnalysisStack', { plumbingEventBus: plumbingStack.eventBus });

new AlertingStack(app, 'AlertingStack', { plumbingEventBus: plumbingStack.eventBus });

new AnalyticsStack(app, 'AnalyticsStack', { plumbingEventBus: plumbingStack.eventBus });

new RespondingStack(app, 'RespondingStack', { plumbingEventBus: plumbingStack.eventBus, analysisBucket: analysisStack.analyseBucket });

new EgressStack(app, 'EgressStack', { plumbingEventBus: plumbingStack.eventBus, analysisBucket: analysisStack.analyseBucket });