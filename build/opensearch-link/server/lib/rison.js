"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.encodeRison = encodeRison;

const BARE_OK = /^[^ '!:(),*@$\-0-9][^ '!:(),*@$]*$/;

function encodeRison(value) {
  if (value === null || value === undefined) {
    return '!n';
  }
  if (typeof value === 'boolean') {
    return value ? '!t' : '!f';
  }
  if (typeof value === 'number') {
    if (!isFinite(value)) return '!n';
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
  if (s === '') return "''";
  if (BARE_OK.test(s)) {
    return s;
  }
  return "'" + s.replace(/[!']/g, (c) => '!' + c) + "'";
}
