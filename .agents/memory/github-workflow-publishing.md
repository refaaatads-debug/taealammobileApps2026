---
name: GitHub workflow publishing
description: The connected GitHub client can publish regular repository files but may reject .github/workflows writes when workflow permission is unavailable.
---

GitHub Actions workflow files may need to be created through the GitHub web UI when the connected GitHub authorization lacks workflow-write permission. A Git-tree write can fail as a whole when it includes a workflow path, even if ordinary tree writes work.

**Why:** The repository API can read the branch and publish ordinary files, but GitHub returns Not Found or a Cloudflare HTML block for workflow-file writes without the required permission. A trailing-newline-only difference is not worth blocking the rest of a source sync.

**How to apply:** Compare the remote and local workflow content after normalizing line endings and trailing whitespace. If they are functionally identical, retain the remote workflow blob and publish the other files. For a substantive difference, keep the validated workflow file in the workspace, then have the repository owner create or commit it through an authorization with workflow-write permission, and add required Actions secrets there.