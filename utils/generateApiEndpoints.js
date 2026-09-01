// Reads the committed Swagger snapshot (fixtures/swagger-production.json) and
// produces fixtures/apiEndpoints.json - the curated set of GET endpoints to
// benchmark for response time.
//
// Selection rules:
//   - GET only (read-only, safe to hammer)
//   - no required parameters (path or query) so no fabricated IDs are needed
//   - excludes side-effecting / streaming / token-minting endpoints (see EXCLUDE)
//
// Regenerate with:  node utils/generateApiEndpoints.js

const fs = require('fs');
const path = require('path');

const SPEC = path.join(process.cwd(), 'fixtures', 'swagger-production.json');
const OUT = path.join(process.cwd(), 'fixtures', 'apiEndpoints.json');

// Endpoints that are GETs with no required params but which we must NOT benchmark:
// they send email, mint tokens, hit webhooks, or open streams.
const EXCLUDE = [
  '/email-test/',        // sends real emails
  '/callSessions/agoraToken', // mints Agora tokens
  '/users/agora/webhook',     // webhook receiver
  '/socket-events',           // may be a stream / SSE
];

function isExcluded(p) {
  return EXCLUDE.some((x) => p.startsWith(x) || p === x);
}

function main() {
  const spec = JSON.parse(fs.readFileSync(SPEC, 'utf8'));
  const basePath = spec.basePath || '';
  const selected = [];
  const skipped = { hasRequiredParam: 0, hasPathParam: 0, excluded: 0 };

  for (const [p, ops] of Object.entries(spec.paths || {})) {
    const op = ops.get;
    if (!op) continue;
    if (p.includes('{')) { skipped.hasPathParam += 1; continue; }
    const required = (op.parameters || []).filter((x) => x.required);
    if (required.length > 0) { skipped.hasRequiredParam += 1; continue; }
    if (isExcluded(p)) { skipped.excluded += 1; continue; }

    selected.push({
      method: 'GET',
      path: p,               // relative to basePath
      tag: (op.tags || [])[0] || 'Untagged',
      summary: op.summary || '',
    });
  }

  // Sort by tag then path for a stable, readable file.
  selected.sort((a, b) => (a.tag + a.path).localeCompare(b.tag + b.path));

  const doc = {
    generatedFrom: 'fixtures/swagger-production.json',
    apiTitle: spec.info && spec.info.title,
    apiVersion: spec.info && spec.info.version,
    basePath,
    excludedPatterns: EXCLUDE,
    count: selected.length,
    endpoints: selected,
  };

  fs.writeFileSync(OUT, JSON.stringify(doc, null, 2));
  console.log(`Wrote ${selected.length} endpoints to ${OUT}`);
  console.log('Skipped:', JSON.stringify(skipped));
}

main();
