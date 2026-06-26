#!/bin/bash
# Build and publish to GitHub Pages.
# Live at: https://claudeteh.github.io/imaginary-creatures-web/
set -e
cd "$(dirname "$0")/.."

npm run build
cd dist

if [ ! -d .git ]; then
  git init && git checkout -b main && git remote add origin https://github.com/ClaudeTeh/imaginary-creatures-web.git
fi

touch .nojekyll
git add -A
git commit -m "Deploy $(date +%Y-%m-%d_%H%M)" || echo "nothing to deploy"
git push origin main --force
echo "Deployed → https://claudeteh.github.io/imaginary-creatures-web/ (Pages rebuild takes ~1 min)"
