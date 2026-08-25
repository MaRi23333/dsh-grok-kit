# Releasing

Normal releases are published to npm automatically by
`.github/workflows/publish.yml` when a non-prerelease GitHub Release is
**published**. The workflow uses npm OIDC Trusted Publishing; it does not use an
npm token or GitHub repository secret.

`v0.1.3` was the one-time interactive bootstrap release. Do not create a GitHub
Release for that already-published version after this workflow is installed: the
workflow will correctly reject it because `dsh-grok-kit@0.1.3` already exists.

## 1. Prepare and verify the version

Update `package.json`, `package-lock.json`, version-bearing source constants, and
committed build artifacts together. Then run:

```sh
npm ci --ignore-scripts
npm run check
git diff --exit-code -- lib
npm pack --dry-run --ignore-scripts
```

Review the package contents and confirm that the repository working tree is
clean after committing the release candidate.

## 2. Create the immutable tag

Create an **annotated** tag whose name is exactly `v${version}`:

```sh
git tag -a v0.1.4 -m "dsh-grok-kit v0.1.4"
git push origin main
git push origin v0.1.4
```

Do not use a lightweight tag and never move an existing published tag. The
workflow verifies that the Release tag is annotated, points to the checked-out
commit, and exactly matches the version in `package.json`.

Wait for both the `main` and tag CI runs to pass before continuing.

## 3. Publish the GitHub Release

Create and publish a normal GitHub Release from the new annotated tag. The
`publish-npm` workflow then performs frozen installation without lifecycle
scripts, typecheck, tests, build, committed-`lib` verification, package checks,
and `npm publish` through OIDC. Successful public OIDC publishes carry npm/SLSA
provenance.

## 4. Do not publish manually

Do not run `npm publish` for a normal release. A manual publish can race the
workflow or permanently consume the version without provenance. After the
workflow succeeds, verify `latest`, repository metadata, provenance, the
registry tarball, and an isolated DSH-profile install.
