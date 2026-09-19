---
name: GitHub connector publishing
description: Safe publishing path when the configured git remote cannot authenticate and repository rules reject generated or credential files
---

When publishing a Replit workspace to GitHub, the configured HTTPS git remote may not inherit the GitHub connector's authorization. Use the connected GitHub API to create a commit on top of the current branch instead of using force push. Exclude generated build output and credential-bearing files; GitHub secret scanning rejects Firebase service-account JSON.

**Why:** The remote can have an unrelated import history, direct git push can fail authentication, and repository secret scanning can reject blobs before a tree or commit is created.

**How to apply:** Verify the remote branch first, compare trees with UTF-8 path output (`core.quotePath=false`), create blobs/tree/commit through the GitHub connection, update the branch without force, and verify the final ref and sensitive-file absence.