# Contributing to Modo

Modo is a community-driven project. The original author built it as a learning experiment and is not actively maintaining it. That means:

- There is no dedicated maintainer reviewing PRs on a schedule
- Issues may not get triaged quickly
- You're encouraged to fork, fix, and submit PRs for anything you care about
- If you want a feature, build it — that's the spirit of this project

## How to Contribute

1. Fork the repo
2. Create a branch (`git checkout -b my-feature`)
3. Make your changes
4. Test locally (see build instructions below)
5. Submit a PR with a clear description of what you changed and why

## Build Instructions

```bash
npm install          # requires Node 20
npm run buildreact   # compile React UI
npm run watch        # compile TypeScript (keep running)
./scripts/code.sh    # launch Modo
```

After changing `.tsx` files, run `npm run buildreact` again. The TypeScript watcher handles `.ts` files automatically.

## Project Layout

Core services live in `src/vs/workbench/contrib/void/common/`. Browser-side logic in `browser/`. React components in `browser/react/src/`.

The `void` folder name is inherited from the upstream Void project — it's just a directory name, not branding.

## What Makes a Good PR

- Focused on one thing
- Doesn't break existing functionality
- Includes a short description of what and why
- Follows the existing code style (no semicolons in the void contrib folder, TypeScript strict patterns)

## Becoming a Maintainer

If you're actively contributing and want commit access, open an issue asking for maintainer status. Serious contributors are welcome to help run this.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
