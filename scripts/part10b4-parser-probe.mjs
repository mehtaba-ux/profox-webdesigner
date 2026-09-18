import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const outPath = path.join(process.cwd(), 'public', 'part10b4-token-audit.json');
await mkdir(path.dirname(outPath), { recursive: true });
const report = { status: 'STARTED', package: '@libpg-query/parser@17.6.10', postgresVersion: '17.6', results: [] };

async function finish() {
  await writeFile(outPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
}

try {
  const install = spawnSync(
    process.platform === 'win32' ? 'npm.cmd' : 'npm',
    ['install', '--no-save', '--package-lock=false', '--no-audit', '--no-fund', '@libpg-query/parser@17.6.10'],
    { cwd: process.cwd(), encoding: 'utf8', timeout: 180000 },
  );
  report.install = {
    status: install.status,
    signal: install.signal,
    stderrTail: String(install.stderr || '').slice(-1200),
    stdoutTail: String(install.stdout || '').slice(-1200),
  };
  if (install.error || install.status !== 0) {
    report.status = 'INSTALL_FAILED';
    report.error = install.error ? String(install.error) : 'npm install returned non-zero status';
    await finish();
    process.exit(0);
  }

  const parser = await import('@libpg-query/parser');
  if (typeof parser.parse !== 'function' || typeof parser.scan !== 'function') {
    report.status = 'API_UNAVAILABLE';
    report.error = 'Required parse/scan APIs are not exported.';
    await finish();
    process.exit(0);
  }

  const { parse, scan } = parser;
  const fixture = JSON.parse(await readFile(path.join(process.cwd(), 'scripts', '.part10b4-native-fixtures.json'), 'utf8'));
  const sha256 = value => createHash('sha256').update(value).digest('hex');
  const OMIT_KEYS = new Set(['location', 'stmt_location', 'stmt_len', 'lineno']);

  function stringValue(node) {
    if (!node || typeof node !== 'object') return null;
    if (typeof node.String?.sval === 'string') return node.String.sval;
    if (Array.isArray(node.List?.items)) {
      const values = node.List.items.map(stringValue).filter(value => typeof value === 'string');
      return values.length ? values[0] : null;
    }
    for (const value of Object.values(node)) {
      const found = stringValue(value);
      if (typeof found === 'string') return found;
    }
    return null;
  }

  function defElem(container, name) {
    const values = Array.isArray(container) ? container : [];
    for (const item of values) {
      if (item?.DefElem?.defname === name) return item.DefElem;
    }
    return null;
  }

  async function bodyTokenDigest(body) {
    const scanned = await scan(body);
    const tokens = [];
    for (const token of scanned.tokens || []) {
      const tokenName = String(token.tokenName || token.token || '');
      if (/COMMENT/i.test(tokenName)) continue;
      const start = Number(token.start || 0);
      const end = Number(token.end || start);
      const text = typeof token.text === 'string' ? token.text : body.slice(start, end);
      tokens.push([tokenName, text]);
    }
    return {
      digest: sha256(JSON.stringify(tokens)),
      count: tokens.length,
    };
  }

  async function replacePlpgsqlBody(ast) {
    const clone = structuredClone(ast);
    const rootName = clone && typeof clone === 'object' ? Object.keys(clone)[0] : null;
    const root = rootName ? clone[rootName] : null;

    if (rootName === 'CreateFunctionStmt') {
      const language = stringValue(defElem(root?.options, 'language')?.arg)?.toLowerCase();
      const bodyElem = defElem(root?.options, 'as');
      const body = stringValue(bodyElem?.arg);
      if (language === 'plpgsql' && typeof body === 'string' && bodyElem) {
        const proof = await bodyTokenDigest(body);
        bodyElem.arg = { String: { sval: '__PART10B4_PLPGSQL_TOKEN_DIGEST__' + proof.digest + ':' + proof.count } };
      }
    } else if (rootName === 'DoStmt') {
      const language = stringValue(defElem(root?.args, 'language')?.arg)?.toLowerCase() || 'plpgsql';
      const bodyElem = defElem(root?.args, 'as');
      const body = stringValue(bodyElem?.arg);
      if (language === 'plpgsql' && typeof body === 'string' && bodyElem) {
        const proof = await bodyTokenDigest(body);
        bodyElem.arg = { String: { sval: '__PART10B4_PLPGSQL_TOKEN_DIGEST__' + proof.digest + ':' + proof.count } };
      }
    }
    return clone;
  }

  function normalize(value) {
    if (Array.isArray(value)) return value.map(normalize);
    if (!value || typeof value !== 'object') return value;
    const out = {};
    for (const key of Object.keys(value).sort()) {
      if (OMIT_KEYS.has(key)) continue;
      out[key] = normalize(value[key]);
    }
    return out;
  }

  async function representation(source) {
    const parsed = await parse(source);
    const statements = [];
    for (const raw of parsed.stmts || []) {
      statements.push(normalize(await replacePlpgsqlBody(raw.stmt)));
    }
    return { version: parsed.version, statements };
  }

  function firstDiff(a, b, currentPath = '$') {
    if (Object.is(a, b)) return null;
    if (typeof a !== typeof b) return { path: currentPath, left: a, right: b };
    if (a === null || b === null || typeof a !== 'object') return { path: currentPath, left: a, right: b };
    if (Array.isArray(a) !== Array.isArray(b)) return { path: currentPath, left: Array.isArray(a) ? 'array' : typeof a, right: Array.isArray(b) ? 'array' : typeof b };
    if (Array.isArray(a)) {
      if (a.length !== b.length) return { path: currentPath + '.length', left: a.length, right: b.length };
      for (let i = 0; i < a.length; i += 1) {
        const diff = firstDiff(a[i], b[i], currentPath + '[' + i + ']');
        if (diff) return diff;
      }
      return null;
    }
    const ak = Object.keys(a);
    const bk = Object.keys(b);
    if (ak.join('|') !== bk.join('|')) return { path: currentPath + '.keys', left: ak, right: bk };
    for (const key of ak) {
      const diff = firstDiff(a[key], b[key], currentPath + '.' + key);
      if (diff) return diff;
    }
    return null;
  }

  for (const row of fixture.rows) {
    try {
      const repositorySource = await readFile(path.join(process.cwd(), 'supabase', 'migrations', row.localFile), 'utf8');
      const nativeSource = Buffer.from(row.sqlBase64, 'base64').toString('utf8');
      const repositoryRep = await representation(repositorySource);
      const nativeRep = await representation(nativeSource);
      const repositoryCanonical = JSON.stringify(repositoryRep);
      const nativeCanonical = JSON.stringify(nativeRep);
      const diff = firstDiff(repositoryRep, nativeRep);
      report.results.push({
        localFile: row.localFile,
        nativeVersion: row.nativeVersion,
        name: row.name,
        parserVersion: repositoryRep.version,
        repositoryStatementCount: repositoryRep.statements.length,
        nativeStatementCount: nativeRep.statements.length,
        repositoryRawSha256: sha256(repositorySource),
        nativeRawSha256: sha256(nativeSource),
        repositoryProofDigest: sha256(repositoryCanonical),
        nativeProofDigest: sha256(nativeCanonical),
        equivalent: repositoryCanonical === nativeCanonical,
        firstDifference: diff ? {
          path: diff.path,
          left: typeof diff.left === 'string' ? diff.left.slice(0, 180) : diff.left,
          right: typeof diff.right === 'string' ? diff.right.slice(0, 180) : diff.right,
        } : null,
      });
    } catch (error) {
      report.results.push({
        localFile: row.localFile,
        nativeVersion: row.nativeVersion,
        name: row.name,
        equivalent: false,
        error: String(error?.stack || error),
      });
    }
  }

  report.status = report.results.every(result => result.equivalent === true) ? 'ALL_EQUIVALENT' : 'NOT_ALL_EQUIVALENT';
} catch (error) {
  report.status = 'PROBE_FAILED';
  report.error = String(error?.stack || error);
}
await finish();
