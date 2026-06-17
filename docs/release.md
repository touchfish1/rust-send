# Release

The desktop app is packaged by GitHub Actions for Windows, macOS, and Linux.

## Create a release

1. Update versions in `package.json` and `src-tauri/tauri.conf.json`.
2. Commit the version change.
3. Create and push a release tag:

```sh
git tag v0.1.0
git push origin v0.1.0
```

The `Release` workflow will build each platform and create a draft GitHub Release with the generated installers attached.

## Manual release

You can also run the `Release` workflow from GitHub Actions with `workflow_dispatch` and provide a tag such as `v0.1.0`.

## Signing

Code signing is not configured yet. The generated installers are usable for testing and distribution review, but Windows and macOS may show unsigned-app warnings until signing certificates and the related GitHub Actions secrets are added.
