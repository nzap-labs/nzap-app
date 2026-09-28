## What and why

<!-- One or two sentences. Link the issue if there is one. -->

## How it was tested

- [ ] `npm run lint && npm run typecheck && npm test`
- [ ] `cargo fmt --all --check && cargo clippy --workspace --all-targets -- -D warnings && cargo test --workspace`
- [ ] Web E2E on mobile viewports (if UI or IPC changed)
- [ ] Android emulator E2E / iOS simulator smoke (if native code, Gradle, R8 or the shell changed)
- [ ] Verified on a real device against a real Colab runtime (if Colab wire behaviour changed) — describe below

## Checklist

- [ ] No tokens, proxy URLs, keystores or personal data in code, tests, fixtures or logs
- [ ] Changes to vendored engine code are marked `mobile:` and listed in VENDORED.md
- [ ] New reflection/JNI entry points have R8 keep rules
- [ ] Docs / PLAN.md updated if behaviour changed
