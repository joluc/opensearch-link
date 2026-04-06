"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenSearchLinkPlugin = void 0;
const redirect_1 = require("./routes/redirect");
class OpenSearchLinkPlugin {
    constructor(initializerContext) {
        this.logger = initializerContext.logger.get();
    }
    setup(core) {
        this.logger.debug('opensearch-link: setting up');
        const router = core.http.createRouter();
        (0, redirect_1.defineRoutes)(router, core, this.logger);
        return {};
    }
    start(core) {
        this.logger.debug('opensearch-link: started');
        return {};
    }
    stop() { }
}
exports.OpenSearchLinkPlugin = OpenSearchLinkPlugin;
