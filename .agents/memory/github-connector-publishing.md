---
name: GitHub connector publishing
description: Safe publishing path when the configured git remote cannot authenticate and repository rules reject generated or credential files
---

When publishing a Replit workspace to GitHub, the configured HTTPS git remote may not inherit the GitHub connector's authorization. For diverged histories, publish a source-tree snapshot as a new commit on the current remote head instead of pushing the local history or using force push. Exclude generated build output, unused uploads, and credential-bearing files; GitHub secret scanning rejects Firebase service-account JSON.

**Why:** The remote can have an unrelated import history, direct git push can fail authentication, and old local commits may carry credential-bearing files even when the current tree does not. Large Git-index output returned through the sandbox shell may also lose its beginning without reporting truncation.

**How to apply:** Verify the remote branch first, compare trees with UTF-8 path output (`core.quotePath=false`) in small, count-checked batches, create blobs/tree/commit through the GitHub connection, update the branch without force, and verify the final ref and sensitive-file absence. Do not parse one large shell-output JSON payload as the complete index.