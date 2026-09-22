set positional-arguments := true
set shell := ["sh", "-cu"]
set windows-shell := ["sh", "-cu"]

# Show the available environment recipes.
default:
    @just --list

# Run the Docker environment's one-click script; extra arguments are forwarded.
docker *args:
    sh scripts/setup-docker.sh "$@"

alias start := docker

# Build the pinned OpenCode version for its versioned GitHub Pages path.
pages-build:
    npm run build:pages

# Copy a Pages build into a checked-out gh-pages worktree without overwriting a version.
pages-stage target:
    node scripts/stage-pages.js "$1"
