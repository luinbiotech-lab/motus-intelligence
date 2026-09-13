import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const files = [
  'docs/verification-sprint-2a.json',
  ...safeJsonFiles('data/evidence'),
  ...safeJsonFiles('data/reports')
];

function safeJsonFiles(dir) {
  try {
    return readdirSync(dir).filter(file => file.endsWith('.json')).map(file => join(dir, file));
  } catch {
    return [];
  }
}

function assertNoDuplicateKeys(text, file) {
  let index = 0;
  const whitespace = () => {
    while (/\s/.test(text[index] ?? '')) index++;
  };
  const string = () => {
    let raw = '';
    index++;
    while (index < text.length) {
      const char = text[index++];
      if (char === '\\') {
        raw += char + (text[index++] ?? '');
        continue;
      }
      if (char === '"') break;
      raw += char;
    }
    return JSON.parse(`"${raw}"`);
  };
  const primitive = () => {
    while (index < text.length && !/[\s,}\]]/.test(text[index])) index++;
  };
  const value = () => {
    whitespace();
    if (text[index] === '{') object();
    else if (text[index] === '[') array();
    else if (text[index] === '"') string();
    else primitive();
  };
  const object = () => {
    const keys = new Set();
    index++;
    whitespace();
    if (text[index] === '}') {
      index++;
      return;
    }
    while (index < text.length) {
      whitespace();
      const key = string();
      if (keys.has(key)) throw new Error(`${file}: duplicate key "${key}"`);
      keys.add(key);
      whitespace();
      if (text[index++] !== ':') throw new Error(`${file}: expected colon`);
      value();
      whitespace();
      const next = text[index++];
      if (next === '}') break;
      if (next !== ',') throw new Error(`${file}: expected comma`);
    }
  };
  const array = () => {
    index++;
    whitespace();
    if (text[index] === ']') {
      index++;
      return;
    }
    while (index < text.length) {
      value();
      whitespace();
      const next = text[index++];
      if (next === ']') break;
      if (next !== ',') throw new Error(`${file}: expected comma`);
    }
  };
  value();
  whitespace();
  if (index !== text.length) throw new Error(`${file}: trailing content`);
}

const results = [];
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const parsed = JSON.parse(text);
  assertNoDuplicateKeys(text, file);
  if (file.includes('data/evidence')) {
    if (!parsed.reportId || parsed.reportId !== parsed.reportMetadata?.reportId) {
      throw new Error(`${file}: reportId mismatch`);
    }
    if (!parsed.validationResult || !Array.isArray(parsed.stages) || !parsed.reviewMetrics) {
      throw new Error(`${file}: missing required evidence fields`);
    }
  }
  if (file.includes('data/reports')) {
    if (!parsed.reportId || !Array.isArray(parsed.sections) || parsed.sections.length !== 9) {
      throw new Error(`${file}: invalid report shape`);
    }
  }
  results.push({ file, reportId: parsed.reportId ?? parsed.reportMetadata?.reportId ?? null });
}

console.log(JSON.stringify({ status: 'PASS', files: results.length, results }, null, 2));
