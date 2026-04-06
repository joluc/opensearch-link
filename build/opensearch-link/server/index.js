"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.plugin = plugin;
const plugin_1 = require("./plugin");
function plugin(initializerContext) {
    return new plugin_1.OpenSearchLinkPlugin(initializerContext);
}
