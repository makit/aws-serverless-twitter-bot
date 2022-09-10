#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { PlumbingStack } from '../lib/stacks/plumbing-stack';
import { IngressStack } from '../lib/stacks/ingress-stack';
import { AnalysisStack } from '../lib/stacks/analysis-stack';

const app = new cdk.App();

const plumbingStack = new PlumbingStack(app, 'PlumbingStack', {});

new IngressStack(app, 'IngressStack', { plumbingEventBus: plumbingStack.eventBus, twitterIdOfAccount: 999 });

new AnalysisStack(app, 'AnalysisStack', { plumbingEventBus: plumbingStack.eventBus });
//TODO: Change 99 to be input