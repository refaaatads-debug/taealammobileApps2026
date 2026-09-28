---
name: GitHub workflow publishing
description: The connected GitHub client can publish regular repository files but may reject .github/workflows writes when workflow permission is unavailable.
---

GitHub Actions workflow files may need to be created through the GitHub web UI when the connected GitHub authorization lacks workflow-write permission.

**Why:** The repository API can read the branch and publish ordinary files, but GitHub returns Not Found or a Cloudflare HTML block for workflow-file writes without the required permission.

**How to apply:** Keep the validated workflow file in the workspace, then have the repository owner create or commit the same `.github/workflows/*.yml` file on the target branch through GitHub, and add required Actions secrets there.