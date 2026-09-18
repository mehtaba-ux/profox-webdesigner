import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parse, parsePlPgSQL } from '@libpg-query/parser';

const fixturePath = path.join(process.cwd(), 'scripts', '.part10b4-native-fixtures.json');
const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));

const sha256 = value => createHash('sha256').update(value).digest('hex');
const OMIT_KEYS = new Set(['location', 'stmt_location', 'stmt_len', 'lineno']);

function normalizeAst(value) {
  if (Array.isArray(value)) return value.map(normalizeAst);
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const key of Object.keys(value).sort()) {
    if (OMIT_KEYS.has(key)) continue;
    out[key] = normalizeAst(value[key]);
  }
  return out;
}

function deepFindDefElem(node, defname) {
  if (!node || typeof node !== 'object') return null;
  if (node.DefElem?.defname === defname) return node.DefElem;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = deepFindDefElem(item, defname);
      if (found) return found;
    }
    return null;
  }
  for (const value of Object.values(node)) {
    const found = deepFindDefElem(value, defname);
    if (found) return found;
  }
  return null;
}

function stringValue(node) {
  if (!node || typeof node !== 'object') return null;
  if (typeof node.String?.sval === 'string') return node.String.sval;
  if (Array.isArray(node.List?.items)) {
    const vals = node.List.items.map(stringValue).filter(v => typeof v === 'string');
    return vals.length ? vals[0] : null;
  }
  for (const value of Object.values(node)) {
    const found = stringValue(value);
    if (typeof found === 'string') return found;
  }
  return null;
}

function statementSlice(source, rawStmt, index, all) {
  const start = Number(rawStmt.stmt_location || 0);
  const declared = Number(rawStmt.stmt_len || 0);
  if (declared > 0) return source.slice(start, start + declared);
  const next = all[index + 1];
  const end = next ? Number(next.stmt_location || source.length) : source.length;
  return source.slice(start, end);
}

function dollarTagFor(body) {
  let i = 0;
  while (true) {
    const tag = '$part10b4' + (i || '') + '$';
    if (!body.includes(tag)) return tag;
    i += 1;
  }
}

async function normalizedStatement(source, rawStmt, index, all) {
  const ast = rawStmt.stmt;
  const root = ast && typeof ast === 'object' ? Object.keys(ast)[0] : null;
  const stmtText = statementSlice(source, rawStmt, index, all);

  if (root === 'CreateFunctionStmt') {
    const language = stringValue(deepFindDefElem(ast, 'language'))?.toLowerCase();
    if (language === 'plpgsql') {
      const parsedBody = await parsePlPgSQL(stmtText);
      return { kind: 'CREATE_FUNCTION_PLPGSQL', ast: normalizeAst(parsedBody) };
    }
  }

  if (root === 'DoStmt') {
    const language = stringValue(deepFindDefElem(ast, 'language'))?.toLowerCase() || 'plpgsql';
    const body = stringValue(deepFindDefElem(ast, 'as'));
    if (language === 'plpgsql' && typeof body === 'string') {
      const tag = dollarTagFor(body);
      const synthetic = 'CREATE FUNCTION part10b4_do_probe() RETURNS void LANGUAGE plpgsql AS ' + tag + body + tag + ';';
      const parsedBody = await parsePlPgSQL(synthetic);
      return { kind: 'DO_PLPGSQL', ast: normalizeAst(parsedBody) };
    }
  }

  return { kind: root || 'UNKNOWN', ast: normalizeAst(ast) };
}

async function migrationRepresentation(source) {
  const parsed = await parse(source);
  const statements = [];
  for (let i = 0; i < parsed.stmts.length; i += 1) {
    statements.push(await normalizedStatement(source, parsed.stmts[i], i, parsed.stmts));
  }
  return { parserVersion: parsed.version, statements };
}

function firstDiff(a, b, pathValue = '$') {
  if (Object.is(a, b)) return null;
  if (typeof a !== typeof b) return { path: pathValue, left: a, right: b };
  if (a === null || b === null || typeof a !== 'object') {
    return { path: pathValue, left: a, right: b };
  }
  if (Array.isArray(a) !== Array.isArray(b)) {
    return { path: pathValue, left: Array.isArray(a) ? 'array' : typeof a, right: Array.isArray(b) ? 'array' : typeof b };
  }
  if (Array.isArray(a)) {
    if (a.length !== b.length) return { path: pathValue + '.length', left: a.length, right: b.length };
    for (let i = 0; i < a.length; i += 1) {
      const diff = firstDiff(a[i], b[i], pathValue + '[' + i + ']');
      if (diff) return diff;
    }
    return null;
  }
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  if (ak.join('|') !== bk.join('|')) return { path: pathValue + '.keys', left: ak, right: bk };
  for (const key of ak) {
    const diff = firstDiff(a[key], b[key], pathValue + '.' + key);
    if (diff) return diff;
  }
  return null;
}

const results = [];
for (const row of fixture.rows) {
  const repoSource = await readFile(path.join(process.cwd(), 'supabase', 'migrations', row.localFile), 'utf8');
  const nativeSource = Buffer.from(row.sqlBase64, 'base64').toString('utf8');
  const repoRep = await migrationRepresentation(repoSource);
  const nativeRep = await migrationRepresentation(nativeSource);
  const repoCanonical = JSON.stringify(repoRep);
  const nativeCanonical = JSON.stringify(nativeRep);
  const diff = firstDiff(repoRep, nativeRep);

  results.push({
    localFile: row.localFile,
    nativeVersion: row.nativeVersion,
    name: row.name,
    postgresVersion: fixture.postgresVersion,
    parserVersion: repoRep.parserVersion,
    repositoryStatementCount: repoRep.statements.length,
    nativeStatementCount: nativeRep.statements.length,
    repositoryRawSha256: sha256(repoSource),
    nativeRawSha256: sha256(nativeSource),
    repositoryProofDigest: sha256(repoCanonical),
    nativeProofDigest: sha256(nativeCanonical),
    equivalent: repoCanonical === nativeCanonical,
    firstDifference: diff ? {
      path: diff.path,
      left: typeof diff.left === 'string' ? diff.left.slice(0, 240) : diff.left,
      right: typeof diff.right === 'string' ? diff.right.slice(0, 240) : diff.right,
    } : null,
  });
}

await mkdir(path.join(process.cwd(), 'public'), { recursive: true });
await writeFile(
  path.join(process.cwd(), 'public', 'part10b4-token-audit.json'),
  JSON.stringify({ generatedBy: '@libpg-query/parser', packageVersion: '17.6.10', results }, null, 2) + '\n',
  'utf8',
);

if (results.some(result => !result.equivalent)) {
  console.error(JSON.stringify(results, null, 2));
  process.exitCode = 2;
} else {
  console.log(JSON.stringify(results, null, 2));
}
