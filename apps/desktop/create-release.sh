#!/usr/bin/env bash

# Desktop App Release Script
# Based on apps/desktop/RELEASE.md
#
# Usage:
#   ./apps/desktop/create-release.sh [version] [--publish] [--signed]
#   Example: ./apps/desktop/create-release.sh
#   Example: ./apps/desktop/create-release.sh 1.4.7
#   Example: ./apps/desktop/create-release.sh 1.4.7 --publish
#   Example: ./apps/desktop/create-release.sh 1.4.7 --signed
#
# This script will:
# 1. Verify prerequisites and sync local main
# 2. Prompt for a version if not provided
# 3. Create a tiny version-bump PR when apps/desktop/package.json needs updating
# 4. Merge that PR before creating the release tag
# 5. Create and push the release tag from main
# 6. Watch the GitHub Actions release workflow
# 7. Leave the release as draft by default or publish it with --publish

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info() {
	echo -e "${BLUE}ℹ ${NC}$1"
}

success() {
	echo -e "${GREEN}✓${NC} $1"
}

warn() {
	echo -e "${YELLOW}⚠${NC} $1"
}

error() {
	echo -e "${RED}✗${NC} $1"
	exit 1
}

tag_exists_remote() {
	local tag_name="$1"
	git ls-remote --exit-code --tags origin "refs/tags/${tag_name}" >/dev/null 2>&1
}

increment_patch() {
	local version="$1"
	local major minor patch
	IFS='.' read -r major minor patch <<<"$version"
	echo "${major}.${minor}.$((patch + 1))"
}

increment_minor() {
	local version="$1"
	local major minor patch
	IFS='.' read -r major minor patch <<<"$version"
	echo "${major}.$((minor + 1)).0"
}

increment_major() {
	local version="$1"
	local major minor patch
	IFS='.' read -r major minor patch <<<"$version"
	echo "$((major + 1)).0.0"
}

require_clean_worktree() {
	if ! git diff --quiet || ! git diff --cached --quiet; then
		error "Git working directory is not clean. Commit or stash your changes before releasing."
	fi
}

read_package_version() {
	node -p "require('./apps/desktop/package.json').version"
}

get_repo_name() {
	git remote get-url origin | sed 's/.*github.com[:/]\(.*\)\.git/\1/'
}

select_version() {
	local current_version="$1"
	local patch_version minor_version major_version version_choice

	patch_version=$(increment_patch "$current_version")
	minor_version=$(increment_minor "$current_version")
	major_version=$(increment_major "$current_version")

	echo ""
	echo -e "${BLUE}Current desktop version:${NC} ${current_version}"
	echo ""
	echo "Select the new version:"
	echo -e "  1) Patch  ${GREEN}${patch_version}${NC} (bug fixes)"
	echo -e "  2) Minor  ${GREEN}${minor_version}${NC} (new features, backward compatible)"
	echo -e "  3) Major  ${GREEN}${major_version}${NC} (breaking changes)"
	echo "  4) Custom (enter manually)"
	echo ""
	read -r -p "Enter choice [1-4]: " version_choice

	case "$version_choice" in
	1)
		VERSION="$patch_version"
		;;
	2)
		VERSION="$minor_version"
		;;
	3)
		VERSION="$major_version"
		;;
	4)
		read -r -p "Enter version (e.g., 1.2.3): " VERSION
		;;
	*)
		error "Invalid choice. Please enter 1, 2, 3, or 4."
		;;
	esac

	if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
		error "Invalid version format. Expected: MAJOR.MINOR.PATCH (e.g., 1.2.3)"
	fi
}

VERSION=""
AUTO_PUBLISH=false
SIGNED_RELEASE=false

for arg in "$@"; do
	case "$arg" in
	--publish)
		AUTO_PUBLISH=true
		;;
	--signed)
		SIGNED_RELEASE=true
		;;
	-*)
		error "Unknown option: $arg\nUsage: $0 [version] [--publish] [--signed]"
		;;
	*)
		if [ -z "$VERSION" ]; then
			VERSION="$arg"
		else
			error "Unexpected argument: $arg\nUsage: $0 [version] [--publish] [--signed]"
		fi
		;;
	esac
done

if [ ! -f "package.json" ] || [ ! -d "apps/desktop" ]; then
	error "Please run this script from the monorepo root directory"
fi

if ! command -v gh >/dev/null 2>&1; then
	error "GitHub CLI (gh) is required but not installed.\nInstall it from: https://cli.github.com/"
fi

if ! command -v jq >/dev/null 2>&1; then
	error "jq is required but not installed.\nInstall it with your package manager."
fi

if ! gh auth status >/dev/null 2>&1; then
	error "Not authenticated with GitHub CLI.\nRun: gh auth login"
fi

require_clean_worktree

TAG_PREFIX="desktop-v"
WORKFLOW_NAME="Release Desktop App Unsigned"
RELEASE_KIND="unsigned"

if [ "$SIGNED_RELEASE" = true ]; then
	TAG_PREFIX="desktop-signed-v"
	WORKFLOW_NAME="Release Desktop App Signed"
	RELEASE_KIND="signed"
fi

REPO=$(get_repo_name)
REPO_OWNER="${REPO%%/*}"

info "Syncing local main before the ${RELEASE_KIND} release..."
git fetch origin --prune
git switch main >/dev/null 2>&1 || git checkout main >/dev/null 2>&1
git pull --ff-only origin main

CURRENT_VERSION=$(read_package_version)

if [ -z "$VERSION" ]; then
	select_version "$CURRENT_VERSION"
fi

TAG_NAME="${TAG_PREFIX}${VERSION}"

info "Preparing ${RELEASE_KIND} desktop release ${VERSION}"
echo ""

info "Checking whether ${TAG_NAME} already exists..."
if git rev-parse "${TAG_NAME}" >/dev/null 2>&1 || tag_exists_remote "${TAG_NAME}"; then
	echo ""
	warn "Tag ${TAG_NAME} already exists."
	if gh release view "${TAG_NAME}" --repo "${REPO}" >/dev/null 2>&1; then
		RELEASE_STATUS=$(gh release view "${TAG_NAME}" --repo "${REPO}" --json isDraft --jq 'if .isDraft then "draft" else "published"')
		echo -e "  GitHub release: ${YELLOW}${RELEASE_STATUS}${NC}"
	else
		echo -e "  GitHub release: ${YELLOW}none${NC}"
	fi
	echo ""
	echo "What would you like to do?"
	echo "  1) Republish - Delete existing release/tag and recreate it"
	echo "  2) Cancel - Exit without changes"
	echo ""
	read -r -p "Enter choice [1-2]: " choice

	case "$choice" in
	1)
		info "Cleaning up ${TAG_NAME} for republish..."
		if gh release view "${TAG_NAME}" --repo "${REPO}" >/dev/null 2>&1; then
			gh release delete "${TAG_NAME}" --repo "${REPO}" --yes
			success "Deleted existing GitHub release"
		fi
		git push origin --delete "${TAG_NAME}" >/dev/null 2>&1 || true
		git tag -d "${TAG_NAME}" >/dev/null 2>&1 || true
		success "Deleted existing local and remote tags"
		;;
	*)
		info "Cancelled. No changes made."
		exit 0
		;;
	esac
fi
success "Tag ${TAG_NAME} is available"

CURRENT_VERSION=$(read_package_version)
PR_NUMBER=""

if [ "${CURRENT_VERSION}" != "${VERSION}" ]; then
	RELEASE_BRANCH="release/desktop-${VERSION}"
	if git show-ref --verify --quiet "refs/heads/${RELEASE_BRANCH}" || git ls-remote --exit-code --heads origin "${RELEASE_BRANCH}" >/dev/null 2>&1; then
		RELEASE_BRANCH="${RELEASE_BRANCH}-$(date +%Y%m%d%H%M%S)"
	fi

	info "Creating version-bump branch ${RELEASE_BRANCH}..."
	git switch -c "${RELEASE_BRANCH}"

	info "Updating apps/desktop/package.json to ${VERSION}..."
	TMP_FILE=$(mktemp)
	jq ".version = \"${VERSION}\"" apps/desktop/package.json >"${TMP_FILE}" && mv "${TMP_FILE}" apps/desktop/package.json
	bunx biome format --write apps/desktop/package.json

	git add apps/desktop/package.json
	git commit -m "chore(desktop): bump version to ${VERSION}"
	success "Committed desktop version bump"

	info "Pushing ${RELEASE_BRANCH}..."
	git push -u origin "${RELEASE_BRANCH}"

	info "Creating version-bump PR..."
	PR_URL=""
	PR_CREATE_RETRIES=6
	PR_CREATE_ATTEMPT=1
	while [ "${PR_CREATE_ATTEMPT}" -le "${PR_CREATE_RETRIES}" ]; do
		set +e
		PR_URL=$(gh pr create \
			--repo "${REPO}" \
			--title "chore(desktop): bump version to ${VERSION}" \
			--body "Bumps the Localset desktop app version to ${VERSION} before tagging the release." \
			--base main \
			--head "${REPO_OWNER}:${RELEASE_BRANCH}" 2>&1)
		PR_CREATE_EXIT=$?
		set -e

		if [ "${PR_CREATE_EXIT}" -eq 0 ]; then
			break
		fi

		if [ "${PR_CREATE_ATTEMPT}" -eq "${PR_CREATE_RETRIES}" ]; then
			error "Could not create version-bump PR after ${PR_CREATE_RETRIES} attempts: ${PR_URL}"
		fi

		echo "  Waiting for GitHub to recognize ${RELEASE_BRANCH}... (attempt ${PR_CREATE_ATTEMPT}/${PR_CREATE_RETRIES})"
		sleep 3
		PR_CREATE_ATTEMPT=$((PR_CREATE_ATTEMPT + 1))
	done
	PR_NUMBER=$(echo "${PR_URL}" | grep -oE '[0-9]+$')
	success "Created PR #${PR_NUMBER}"

	info "Merging PR #${PR_NUMBER} before tagging..."
	gh pr merge "${PR_NUMBER}" --repo "${REPO}" --merge --delete-branch
	success "Merged version-bump PR"

	info "Refreshing local main after merge..."
	git switch main
	git pull --ff-only origin main
else
	success "apps/desktop/package.json already matches ${VERSION}; no version-bump PR needed"
fi

CURRENT_VERSION=$(read_package_version)
if [ "${CURRENT_VERSION}" != "${VERSION}" ]; then
	error "apps/desktop/package.json is still ${CURRENT_VERSION}; refusing to tag ${TAG_NAME}"
fi

TAG_SHA=$(git rev-parse HEAD)
info "Creating ${TAG_NAME} from main at ${TAG_SHA}..."
git tag "${TAG_NAME}"
git push origin "${TAG_NAME}"
success "Pushed ${TAG_NAME}"

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}🎉 Release process initiated successfully!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

info "Monitoring GitHub Actions workflow..."
echo "  Waiting for workflow to start..."

MAX_RETRIES=12
RETRY_COUNT=0
WORKFLOW_RUN=""

while [ "${RETRY_COUNT}" -lt "${MAX_RETRIES}" ] && [ -z "${WORKFLOW_RUN}" ]; do
	sleep 5
	WORKFLOW_RUN=$(gh run list \
		--repo "${REPO}" \
		--workflow "${WORKFLOW_NAME}" \
		--json databaseId,headSha,event \
		--jq ".[] | select(.headSha == \"${TAG_SHA}\" and .event == \"push\") | .databaseId" | head -1)
	RETRY_COUNT=$((RETRY_COUNT + 1))

	if [ -z "${WORKFLOW_RUN}" ] && [ "${RETRY_COUNT}" -lt "${MAX_RETRIES}" ]; then
		echo "  Still waiting... (attempt ${RETRY_COUNT}/${MAX_RETRIES})"
	fi
done

if [ -z "${WORKFLOW_RUN}" ]; then
	warn "Could not find the workflow run automatically."
	echo "  Check: https://github.com/${REPO}/actions"
else
	success "Found workflow run: ${WORKFLOW_RUN}"
	echo ""
	info "Watching workflow progress..."
	echo "  View in browser: https://github.com/${REPO}/actions/runs/${WORKFLOW_RUN}"
	echo ""

	gh run watch "${WORKFLOW_RUN}" --repo "${REPO}" || warn "Workflow monitoring interrupted"
	WORKFLOW_STATUS=$(gh run view "${WORKFLOW_RUN}" --repo "${REPO}" --json conclusion --jq .conclusion)

	if [ "${WORKFLOW_STATUS}" = "success" ]; then
		success "Workflow completed successfully"
	elif [ "${WORKFLOW_STATUS}" = "failure" ]; then
		error "Workflow failed. Check: https://github.com/${REPO}/actions/runs/${WORKFLOW_RUN}"
	else
		warn "Workflow ended with status: ${WORKFLOW_STATUS}"
	fi
fi

echo ""
info "Waiting for the GitHub release to appear..."

MAX_RELEASE_RETRIES=20
RELEASE_RETRY_COUNT=0
RELEASE_FOUND=""

while [ "${RELEASE_RETRY_COUNT}" -lt "${MAX_RELEASE_RETRIES}" ] && [ -z "${RELEASE_FOUND}" ]; do
	sleep 3
	RELEASE_FOUND=$(gh release list --repo "${REPO}" --json tagName --jq ".[] | select(.tagName == \"${TAG_NAME}\") | .tagName")
	RELEASE_RETRY_COUNT=$((RELEASE_RETRY_COUNT + 1))

	if [ -z "${RELEASE_FOUND}" ] && [ "${RELEASE_RETRY_COUNT}" -lt "${MAX_RELEASE_RETRIES}" ]; then
		echo "  Waiting for release to be created... (attempt ${RELEASE_RETRY_COUNT}/${MAX_RELEASE_RETRIES})"
	fi
done

RELEASE_URL="https://github.com/${REPO}/releases/tag/${TAG_NAME}"

if [ -z "${RELEASE_FOUND}" ]; then
	warn "Release not found yet. It may still be processing."
	echo "  Check: https://github.com/${REPO}/releases"
	exit 0
fi

if [ "${AUTO_PUBLISH}" = true ]; then
	info "Publishing release..."
	gh release edit "${TAG_NAME}" --repo "${REPO}" --draft=false
	success "Release published"
else
	success "Draft release created"
fi

echo ""
echo -e "${BLUE}Release tag:${NC} ${TAG_NAME}"
echo -e "${BLUE}Tagged commit:${NC} ${TAG_SHA}"
if [ -n "${PR_NUMBER}" ]; then
	echo -e "${BLUE}Version bump PR:${NC} #${PR_NUMBER}"
fi
echo -e "${BLUE}Release URL:${NC} ${RELEASE_URL}"
if [ "${AUTO_PUBLISH}" = false ]; then
	echo ""
	echo "To publish manually:"
	echo "  gh release edit ${TAG_NAME} --repo ${REPO} --draft=false"
fi
