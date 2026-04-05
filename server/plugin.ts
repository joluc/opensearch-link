import {
  CoreSetup,
  CoreStart,
  Logger,
  Plugin,
  PluginInitializerContext,
} from '../../../src/core/server';
import { OpenSearchLinkPluginSetup, OpenSearchLinkPluginStart } from './types';
import { defineRoutes } from './routes/redirect';

export class OpenSearchLinkPlugin
  implements Plugin<OpenSearchLinkPluginSetup, OpenSearchLinkPluginStart> {
  private readonly logger: Logger;

  constructor(initializerContext: PluginInitializerContext) {
    this.logger = initializerContext.logger.get();
  }

  public setup(core: CoreSetup) {
    this.logger.debug('opensearch-link: setting up');

    const router = core.http.createRouter();
    defineRoutes(router, core, this.logger);

    return {};
  }

  public start(core: CoreStart) {
    this.logger.debug('opensearch-link: started');
    return {};
  }

  public stop() {}
}
