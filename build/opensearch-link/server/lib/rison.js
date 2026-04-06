"use strict";
/*
 * RISON encoder — minimal implementation for OpenSearch Dashboards state.
 *
 * RISON is a compact, URL-safe serialization of JSON used by Kibana/OpenSearch
 * Dashboards for the _g and _a URL hash parameters.
 *
 * Spec: https://github.com/Nanonid/rison
 *
 * Key differences from JSON:
 *   - No quotes around keys that are valid identifiers
 *   - Strings delimited by single quotes (only when needed)
 *   - Objects use ( ) instead of { }
 *   - Arrays use !( ) instead of [ ]
 *   - true/false are !t/!f
 *   - null is !n
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.encodeRison = encodeRison;
// RISON spec: not_idchar = " '!:(),*@$"  not_idstart adds "-0123456789"
// A bare (unquoted) string must not start with not_idstart chars and must not
// contain any not_idchar chars.
const BARE_OK = /^[^ '!:(),*@$\-0-9][^ '!:(),*@$]*$/;
function encodeRison(value) {
    if (value === null || value === undefined) {
        return '!n';
    }
    if (typeof value === 'boolean') {
        return value ? '!t' : '!f';
    }
    if (typeof value === 'number') {
        if (!isFinite(value))
            return '!n';
        return String(value);
    }
    if (typeof value === 'string') {
        return encodeString(value);
    }
    if (Array.isArray(value)) {
        return '!(' + value.map(encodeRison).join(',') + ')';
    }
    if (typeof value === 'object') {
        const entries = Object.entries(value);
        const parts = entries.map(([k, v]) => encodeKey(k) + ':' + encodeRison(v));
        return '(' + parts.join(',') + ')';
    }
    return '!n';
}
function encodeKey(key) {
    if (key.length > 0 && BARE_OK.test(key)) {
        return key;
    }
    return encodeString(key);
}
function encodeString(s) {
    if (s === '')
        return "''";
    // If the string can be represented bare (no quoting needed)
    if (BARE_OK.test(s)) {
        return s;
    }
    // Quote with single quotes, escaping only single quotes and !
    return "'" + s.replace(/[!']/g, (c) => '!' + c) + "'";
}
