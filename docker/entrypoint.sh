#!/bin/sh
set -eu

child=""

shutdown() {
  if [ -n "$child" ] && kill -0 "$child" 2>/dev/null; then
    kill -TERM "$child" 2>/dev/null || true
    i=0
    while kill -0 "$child" 2>/dev/null && [ "$i" -lt 20 ]; do
      sleep 1
      i=$((i + 1))
    done
    if kill -0 "$child" 2>/dev/null; then
      kill -KILL "$child" 2>/dev/null || true
    fi
  fi
}

trap shutdown TERM INT
"$@" &
child=$!
wait "$child"
