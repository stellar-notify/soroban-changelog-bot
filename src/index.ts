import * as core from '@actions/core';
import * as github from '@actions/github';
import { interfaceFromWasm } from './contract-spec';
import { diffInterfaces } from './interface-diff';
import { fetchDeployedWasm } from './rpc-client';
import { generateChangelog } from './changelog-llm';
import { upsertRelease } from './github-release';

async function run(): Promise<void> {
  try {
    const rpcUrl = core.getInput('rpc-url', { required: true });
    const contractName = core.getInput('contract-name', { required: true });
    const previousContractId = core.getInput('previous-contract-id', { required: true });
    const newContractId = core.getInput('new-contract-id', { required: true });
    const previousTag = core.getInput('previous-tag', { required: true });
    const newTag = core.getInput('new-tag') || github.context.ref.replace('refs/tags/', '');
    const githubToken = core.getInput('github-token', { required: true });
    const anthropicApiKey = core.getInput('anthropic-api-key') || undefined;

    core.info(`Fetching deployed WASM for ${previousTag} (${previousContractId}) from ${rpcUrl}`);
    const previousWasm = await fetchDeployedWasm(rpcUrl, previousContractId);

    core.info(`Fetching deployed WASM for ${newTag} (${newContractId}) from ${rpcUrl}`);
    const newWasm = await fetchDeployedWasm(rpcUrl, newContractId);

    core.info('Decoding contract interfaces from WASM contractspecv0 sections');
    const previousInterface = interfaceFromWasm(previousWasm);
    const newInterface = interfaceFromWasm(newWasm);

    core.info('Diffing interfaces');
    const diff = diffInterfaces(previousInterface, newInterface);
    core.info(`Found ${diff.changes.length} interface-level change(s)`);
    core.setOutput('change-count', String(diff.changes.length));
    core.setOutput('diff-json', JSON.stringify(diff.changes));

    core.info(anthropicApiKey ? 'Generating changelog via Anthropic API' : 'No anthropic-api-key set - using deterministic changelog renderer');
    const body = await generateChangelog(
      {
        contractName,
        previousTag,
        newTag,
        previousContractId,
        newContractId,
        changes: diff.changes,
      },
      anthropicApiKey,
    );

    const fullBody = [`# ${contractName} ${newTag}`, '', `_Diffed against \`${previousTag}\` (\`${previousContractId}\`) via Stellar RPC at \`${rpcUrl}\`._`, '', body].join('\n');

    const { owner, repo } = github.context.repo;
    const result = await upsertRelease(githubToken, { owner, repo, tag: newTag }, fullBody, `${contractName} ${newTag}`);

    core.info(`${result.created ? 'Created' : 'Updated'} release: ${result.url}`);
    core.setOutput('release-url', result.url);
  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}

run();
