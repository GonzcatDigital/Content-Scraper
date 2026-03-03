import fs from 'fs/promises';
import path from 'path';

const CONTENT_DIR = './downloads/content';
const DEFAULT_AUTHOR = 'Phoenix Accident and Injury Law Firm';

function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return null;
  const [, fmBlock, body] = match;
  const fields = {};
  let currentKey = null;
  let currentValue = [];
  for (const line of fmBlock.split(/\r?\n/)) {
    if (line.match(/^\s+-\s+/)) {
      if (currentKey) currentValue.push(line.replace(/^\s*-\s*/, '').trim());
      continue;
    }
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (kv) {
      if (currentKey) {
        fields[currentKey] = currentValue.length ? currentValue : (fields[currentKey] ?? currentValue.join('\n'));
      }
      currentKey = kv[1];
      const v = kv[2].trim();
      currentValue = v ? [v] : [];
    }
  }
  if (currentKey) {
    fields[currentKey] = currentValue.length === 1 && !currentValue[0].startsWith('-') ? currentValue[0] : currentValue;
  }
  return { fields, body };
}

function formatValue(value) {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string' && (value.includes(':') || value.includes('#') || value.includes('\n') || value.includes('"'))) {
    return `"${value.replace(/"/g, '\\"')}"`;
  }
  return value;
}

function dumpFrontmatter(fields) {
  const order = ['title', 'url', 'description', 'author', 'date', 'tags', 'image', 'imageAlt'];
  const lines = [];
  for (const key of order) {
    if (!(key in fields)) continue;
    const value = fields[key];
    if (key === 'tags') {
      lines.push('tags:');
      const list = Array.isArray(value) ? value : [value];
      for (const item of list) lines.push(`    - ${String(item).replace(/^\s*-\s*/, '')}`);
    } else {
      lines.push(`${key}: ${formatValue(value)}`);
    }
  }
  return '---\n' + lines.join('\n') + '\n---\n\n';
}

async function main() {
  const files = await fs.readdir(CONTENT_DIR);
  const mdFiles = files.filter((f) => f.endsWith('.md'));

  for (const file of mdFiles) {
    const filePath = path.join(CONTENT_DIR, file);
    const slug = path.basename(file, '.md');
    const content = await fs.readFile(filePath, 'utf-8');
    const parsed = parseFrontmatter(content);
    if (!parsed) {
      console.warn('Skip (no frontmatter):', file);
      continue;
    }

    const { fields, body } = parsed;
    if (!fields.url) fields.url = slug;
    if (!fields.author) fields.author = DEFAULT_AUTHOR;
    if (!fields.tags) fields.tags = ['post'];

    const newFm = dumpFrontmatter(fields);
    await fs.writeFile(filePath, newFm + body, 'utf-8');
    console.log('Updated:', file);
  }
}

main().catch(console.error);
