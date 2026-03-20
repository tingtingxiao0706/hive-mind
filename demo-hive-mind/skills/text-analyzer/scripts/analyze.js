#!/usr/bin/env node
const text = process.argv.slice(2).join(' ');

if (!text) {
  console.error('Usage: analyze.js <text>');
  process.exit(1);
}

const characters = text.length;

const cjkPattern = /[\u2E80-\u2FFF\u3040-\u309F\u30A0-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/g;
const cjkChars = text.match(cjkPattern) || [];
const latinWords = text
  .replace(cjkPattern, ' ')
  .split(/\s+/)
  .filter(w => w.length > 0);
const words = latinWords.length + cjkChars.length;

const sentences = text.split(/[.!?。！？]+/).filter(s => s.trim().length > 0).length;
const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0).length || 1;

const freq = {};
for (const w of latinWords) {
  const lower = w.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g, '');
  if (lower.length > 1) freq[lower] = (freq[lower] || 0) + 1;
}
for (const c of cjkChars) {
  freq[c] = (freq[c] || 0) + 1;
}
const topWords = Object.entries(freq)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10)
  .map(([word, count]) => ({ word, count }));

const readingTimeMinutes = Math.max(0.1, words / 250).toFixed(1);

const report = {
  characters,
  words,
  sentences,
  paragraphs,
  topWords,
  readingTimeMinutes: Number(readingTimeMinutes),
};

console.log(JSON.stringify(report, null, 2));
