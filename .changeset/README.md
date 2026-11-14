# Changesets

Run `pnpm changeset` for each change people will notice, and write the summary in Vietnamese, for students:
the app shows each `- ` line of the release notes in its update and "Có gì mới" dialogs.
Merging to main opens a "version packages" PR; merging that PR bumps `package.json`, writes
`CHANGELOG.md`, and CI builds the APK and .ipa and publishes the GitHub release the app updates from.
