import Anthropic from '@anthropic-ai/sdk';
import { Change } from './interface-diff';

export interface ChangelogInput {
  contractName: string;
  previousTag: string;
  newTag: string;
  previousContractId: string;
  newContractId: string;
  changes: Change[];
}

const SYSTEM_PROMPT = `You write release notes for Soroban smart contract deployments on Stellar.
You are given a structured, pre-computed diff of two contract WASM interfaces - you do not need to
infer changes yourself, only to explain and categorize the ones you are given, for a developer
audience integrating against this contract.

Output GitHub-flavored Markdown with exactly these four sections, in this order, using "##" headers:
## Breaking Changes
## New Features
## Security-Relevant Changes
## Storage Migrations Needed

Rules:
- Every change kind tagged "severity: breaking" MUST appear under "Breaking Changes" or, if it is
  specifically about a storage-shaped type (struct/enum whose name ends in Key/State/Config/Storage),
  under "Storage Migrations Needed" instead.
- "Security-Relevant Changes" covers changes to error codes/error enums, authorization-adjacent
  function signature changes (e.g. added/removed an Address parameter, changed a require_auth-shaped
  function), and any removed function that looks like an access-control guard. Only include items
  that genuinely fit - it is fine for this section to just say "No security-relevant changes detected
  in this release." if nothing qualifies.
- "New Features" covers added functions, added struct fields, added enum/union cases.
- "Storage Migrations Needed" covers any change flagged with kind starting "storage-", plus any
  breaking change to a type whose name looks storage-related. For each item, explain concretely what
  happens to existing ledger entries if this WASM is installed over a contract with live state, and
  what the contract author needs to do (e.g. write a migrate() function, version the storage key).
  If there are none, say "No storage schema changes detected between these two versions."
- If a section has no relevant items, write one sentence saying so - never omit a header.
- Use backticks around function/type names. Be concise: one to three sentences per item, as a
  markdown bullet list under each header.
- Do not invent changes that are not present in the provided diff data.
- Do not include a title/H1 - the caller adds that separately.`;

function buildUserPrompt(input: ChangelogInput): string {
  const lines = [
    `Contract: ${input.contractName}`,
    `Previous version: ${input.previousTag} (contract id ${input.previousContractId})`,
    `New version: ${input.newTag} (contract id ${input.newContractId})`,
    '',
    'Structured diff (JSON array of {kind, severity, summary, detail}):',
    '```json',
    JSON.stringify(input.changes, null, 2),
    '```',
  ];
  if (input.changes.length === 0) {
    lines.push('', 'Note: no interface differences were detected between these two versions.');
  }
  return lines.join('\n');
}

/** Deterministic fallback used when no ANTHROPIC_API_KEY is configured, and in tests. */
export function renderChangelogWithoutLlm(input: ChangelogInput): string {
  const byBucket: Record<string, Change[]> = {
    breaking: [],
    storage: [],
    security: [],
    features: [],
  };

  for (const c of input.changes) {
    if (c.kind.startsWith('storage-')) byBucket.storage.push(c);
    else if (c.kind.includes('error')) byBucket.security.push(c);
    else if (c.severity === 'breaking') byBucket.breaking.push(c);
    else byBucket.features.push(c);
  }

  const section = (title: string, items: Change[], emptyMsg: string) =>
    [`## ${title}`, items.length ? items.map((c) => `- ${c.summary}`).join('\n') : emptyMsg, ''].join('\n');

  return [
    section('Breaking Changes', byBucket.breaking, 'No breaking changes detected in this release.'),
    section('New Features', byBucket.features, 'No new features detected in this release.'),
    section('Security-Relevant Changes', byBucket.security, 'No security-relevant changes detected in this release.'),
    section('Storage Migrations Needed', byBucket.storage, 'No storage schema changes detected between these two versions.'),
  ].join('\n');
}

export async function generateChangelog(input: ChangelogInput, apiKey: string | undefined): Promise<string> {
  if (!apiKey) {
    return renderChangelogWithoutLlm(input);
  }

  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildUserPrompt(input) }],
  });

  const text = response.content
    .map((block) => (block.type === 'text' ? block.text : ''))
    .filter(Boolean)
    .join('\n')
    .trim();

  if (!text) {
    // Never ship a silently empty release body - fall back to the
    // deterministic renderer rather than fail the whole workflow.
    return renderChangelogWithoutLlm(input);
  }
  return text;
}
