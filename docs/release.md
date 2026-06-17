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

The `Release` workflow will build each platform and publish a GitHub Release with the generated installers attached.

## Release page copy

Recommended wording for GitHub Releases:

- Windows:
  - `setup.exe` for most users
  - `msi` for managed deployment
- macOS:
  - `dmg` for Apple Silicon Macs
- Linux:
  - `deb` for Ubuntu / Debian
  - `rpm` for Fedora / RHEL / openSUSE
  - `AppImage` for portable distribution

Example AppImage usage:

```bash
chmod +x rust-send_0.1.1_amd64.AppImage
./rust-send_0.1.1_amd64.AppImage
```

## Manual release

You can also run the `Release` workflow from GitHub Actions with `workflow_dispatch` and provide a tag such as `v0.1.0`. Manual runs can still be created as drafts for verification.

## App updates

The desktop app now uses Tauri's updater plugin and reads update metadata from:

`https://github.com/touchfish1/rust-send/releases/latest/download/latest.json`

For this to work in production, tagged releases must be published instead of left as drafts.

## Signing

Updater artifacts are signed in GitHub Actions with the `TAURI_SIGNING_PRIVATE_KEY` repository secret.

The public key is committed in `src-tauri/tauri.conf.json`, while the private key must stay outside the repository.

Windows and macOS system-level notarization / code-signing warnings may still appear until platform-specific signing certificates are configured, but the updater signature chain itself is now in place.
