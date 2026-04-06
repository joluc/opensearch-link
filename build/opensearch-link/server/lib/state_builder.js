"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildDiscoverUrl = buildDiscoverUrl;
const types_1 = require("../types");
const rison_1 = require("./rison");
function buildDiscoverUrl(params, indexPatternId) {
    const { globalState, appState } = buildState(params, indexPatternId);
    return `/app/discover#/?_g=${globalState}&_a=${appState}`;
}
function buildState(params, indexPatternId) {
    // Time range
    let timeFrom;
    let timeTo;
    if (params.from) {
        timeFrom = params.from;
        timeTo = params.to || 'now';
    }
    else {
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
    const filters = [];
    for (const [key, value] of Object.entries(params)) {
        if (types_1.RESERVED_PARAMS.has(key) || value === undefined)
            continue;
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
    const appObj = {
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
        globalState: (0, rison_1.encodeRison)(globalObj),
        appState: (0, rison_1.encodeRison)(appObj),
    };
}
