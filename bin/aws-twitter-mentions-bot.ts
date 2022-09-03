#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { PlumbingStack } from '../lib/stacks/plumbing-stack';
import { IngressStack } from '../lib/stacks/ingress-stack';

const app = new cdk.App();

const plumbingStack = new PlumbingStack(app, 'PlumbingStack', {});
new IngressStack(app, 'IngressStack', { plumbingEventBus: plumbingStack.eventBus });