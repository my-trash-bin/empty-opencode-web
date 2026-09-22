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
