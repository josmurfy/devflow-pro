#!/bin/bash
# DevFlow Pro - Update Publisher
# Usage: ./scripts/publish-update.sh <version> "<message>" [stable|beta]
# Example: ./scripts/publish-update.sh 1.0.6 "Fix: status bar tooltip" stable
set -e

VERSION=$1
MESSAGE=$2
CHANNEL=${3:-stable}

if [[ -z "$VERSION" || -z "$MESSAGE" ]]; then
    echo "Usage: $0 <version> <message> [stable|beta]"
    echo "Example: $0 1.0.6 'Fix status bar tooltip' stable"
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$ROOT_DIR"

echo "🚀 Publishing DevFlow Pro v$VERSION ($CHANNEL channel)"

# 1. Update version in package.json
echo "📝 Bumping version to $VERSION..."
npm version "$VERSION" --no-git-tag-version --allow-same-version

# 2. Update CHANGELOG.md — prepend new entry
DATE=$(date +%Y-%m-%d)
CHANGELOG_ENTRY="## [$VERSION] - $DATE\n\n### Changed\n- $MESSAGE\n"

# Insert after "## [Unreleased]" block (between Unreleased and first real version)
awk -v entry="$CHANGELOG_ENTRY" '
/^## \[Unreleased\]/{print; found=1; next}
found && /^## \[/{print entry; found=0}
{print}
' CHANGELOG.md > CHANGELOG.tmp && mv CHANGELOG.tmp CHANGELOG.md

# 3. Compile TypeScript
echo "🔨 Compiling TypeScript..."
npm run compile

# 4. Package .vsix
echo "📦 Packaging..."
npx vsce package --no-dependencies

VSIX_FILE="devflow-pro-$VERSION.vsix"

if [[ ! -f "$VSIX_FILE" ]]; then
    echo "❌ VSIX not found: $VSIX_FILE"
    exit 1
fi

# 5. Calculate SHA256
SHA256=$(sha256sum "$VSIX_FILE" | awk '{print $1}')
SIZE=$(stat -c%s "$VSIX_FILE")
echo "📊 SHA256: $SHA256"
echo "📊 Size: $SIZE bytes"

# 6. Stage and commit
echo "💾 Committing release..."
git add package.json CHANGELOG.md
git commit -m "release: v$VERSION — $MESSAGE"
git tag "v$VERSION"

# 7. Push to GitHub
echo "🐙 Pushing to GitHub..."
git push origin main
git push origin "v$VERSION"

# 8. Create GitHub release with .vsix attached (requires gh CLI)
if command -v gh &>/dev/null; then
    echo "📌 Creating GitHub release..."
    gh release create "v$VERSION" \
        --title "v$VERSION" \
        --notes "$MESSAGE" \
        "$VSIX_FILE"
else
    echo "ℹ️  gh CLI not found — upload $VSIX_FILE to GitHub releases manually"
fi

echo ""
echo "✅ DevFlow Pro v$VERSION published to $CHANNEL channel"
echo "🔗 https://github.com/josmurfy/devflow-pro/releases/tag/v$VERSION"
