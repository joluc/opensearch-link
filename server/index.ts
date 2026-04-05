import { PluginInitializerContext } from '../../../src/core/server';
import { OpenSearchLinkPlugin } from './plugin';

export function plugin(initializerContext: PluginInitializerContext) {
  return new OpenSearchLinkPlugin(initializerContext);
}

export { OpenSearchLinkPluginSetup, OpenSearchLinkPluginStart } from './types';
