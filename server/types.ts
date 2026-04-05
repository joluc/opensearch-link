export interface OpenSearchLinkPluginSetup {}
export interface OpenSearchLinkPluginStart {}

export const RESERVED_PARAMS = new Set([
  'index',
  'time',
  'from',
  'to',
  'query',
  'columns',
]);
