#!/usr/bin/env bash
# Replays an example coding-client session for a documentation recording.
# The transcript is the example session printed on a step page, not output
# captured from a real run; the banner says so in every frame that follows.
# Usage: bash docs/assets/terminal/replay.sh <transcript>
set -euo pipefail

transcript="$1"
dim=$'\e[2m' bold=$'\e[1m' green=$'\e[32m' red=$'\e[31m' yellow=$'\e[33m' cyan=$'\e[36m' reset=$'\e[0m'

printf '%sIllustrative: the example session from the docs, not a recorded run.%s\n\n' "$dim" "$reset"
printf '%s>%s ' "$bold" "$reset"
# The recording types the request here, as a person would in the client.
IFS= read -r _request || true

# The first transcript line is the request just typed; replay the rest.
tail -n +2 "$transcript" | while IFS= read -r line; do
  case "$line" in
    "▸"*) sleep 0.7; printf '%s%s%s\n' "$cyan" "$line" "$reset" ;;
    "✓"*) sleep 0.25; printf '%s%s%s\n' "$green" "$line" "$reset" ;;
    "✗"*) sleep 0.25; printf '%s%s%s\n' "$red" "$line" "$reset" ;;
    "?"*) sleep 0.25; printf '%s%s%s\n' "$yellow" "$line" "$reset" ;;
    "") sleep 0.2; printf '\n' ;;
    *) sleep 0.12; printf '%s\n' "$line" ;;
  esac
done
