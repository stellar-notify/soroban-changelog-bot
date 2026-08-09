import { getOctokit } from '@actions/github';

export interface ReleaseTarget {
  owner: string;
  repo: string;
  tag: string;
}

/**
 * Creates a GitHub Release for `tag` if one doesn't exist, or updates its
 * body in place if it does (idempotent - safe to re-run a workflow, e.g.
 * after fixing a secret or re-tagging).
 */
export async function upsertRelease(
  token: string,
  target: ReleaseTarget,
  body: string,
  releaseName: string,
): Promise<{ url: string; created: boolean }> {
  const octokit = getOctokit(token);
  const { owner, repo, tag } = target;

  try {
    const existing = await octokit.rest.repos.getReleaseByTag({ owner, repo, tag });
    const updated = await octokit.rest.repos.updateRelease({
      owner,
      repo,
      release_id: existing.data.id,
      body,
      name: releaseName,
    });
    return { url: updated.data.html_url, created: false };
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status !== 404) throw err;

    const created = await octokit.rest.repos.createRelease({
      owner,
      repo,
      tag_name: tag,
      name: releaseName,
      body,
      draft: false,
      prerelease: /-/.test(tag), // e.g. v1.2.0-rc.1
    });
    return { url: created.data.html_url, created: true };
  }
}
