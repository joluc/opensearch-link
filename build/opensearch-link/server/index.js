"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.plugin = plugin;

const { OpenSearchLinkPlugin } = require('./plugin');

function plugin(initializerContext) {
  return new OpenSearchLinkPlugin(initializerContext);
}
