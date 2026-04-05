import { RESERVED_PARAMS } from '../types';
import { encodeRison } from './rison';

interface LinkParams {
  // Reserved params
  index?: string;
  time?: string;
  from?: string;
  to?: string;
  query?: string;
  columns?: string;
  // Everything else becomes a filter
  [key: string]: string | undefined;
}

interface BuildResult {
  globalState: string;
  appState: string;
}

export function buildDiscoverUrl(
  params: LinkParams,
  indexPatternId: string | undefined
): string {
  const { globalState, appState } = buildState(params, indexPatternId);
  return `/app/discover#/?_g=${globalState}&_a=${appState}`;
}

function buildState(params: LinkParams, indexPatternId: string | undefined): BuildResult {
  // Time range
  let timeFrom: string;
  let timeTo: string;

  if (params.from) {
    timeFrom = params.from;
    timeTo = params.to || 'now';
  } else {
    const time = params.time || '15m';
    timeFrom = `now-${time}`;
    timeTo = 'now';
  }

  // Global state
  const globalObj = {
    filters: [],
    refreshInterval: { pause: true, value: 0 },
    time: { from: timeFrom, to: timeTo },
  };

  // Columns
  const columns = params.columns
    ? params.columns.split(',').map((c) => c.trim())
    : ['message'];

  // Build filters from all non-reserved params
  const filters: unknown[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (RESERVED_PARAMS.has(key) || value === undefined) continue;

    filters.push({
      $state: { store: 'appState' },
      meta: {
        alias: null,
        disabled: false,
        ...(indexPatternId ? { index: indexPatternId } : {}),
        key,
        negate: false,
        params: { query: value },
        type: 'phrase',
      },
      query: {
        match_phrase: {
          [key]: value,
        },
      },
    });
  }

  // App state
  const appObj: Record<string, unknown> = {
    columns,
    filters,
    interval: 'auto',
    query: {
      language: 'kuery',
      query: params.query || '',
    },
    sort: [['@timestamp', 'desc']],
  };

  if (indexPatternId) {
    appObj.index = indexPatternId;
  }

  return {
    globalState: encodeRison(globalObj),
    appState: encodeRison(appObj),
  };
}
