# CI (paused)

`check.yml` is the GitHub Actions workflow (syntax check + `npm test` on every push and pull request).
It lives here because the GitHub token used to push lacks the `workflow` scope.
To turn it back on: `mkdir -p .github/workflows && git mv ci/check.yml .github/workflows/check.yml`,
then push from a login that has the `workflow` scope (e.g. VS Code's GitHub sign-in).
