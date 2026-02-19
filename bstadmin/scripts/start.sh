#!/bin/sh
set -e

node server.js &
SERVER_PID=$!

node scripts/cron-runner.js &
CRON_PID=$!

terminate() {
  kill $SERVER_PID 2>/dev/null || true
  kill $CRON_PID 2>/dev/null || true
}

trap terminate INT TERM

while true; do
  if ! kill -0 $SERVER_PID 2>/dev/null; then
    kill $CRON_PID 2>/dev/null || true
    wait $CRON_PID 2>/dev/null || true
    exit 1
  fi
  if ! kill -0 $CRON_PID 2>/dev/null; then
    kill $SERVER_PID 2>/dev/null || true
    wait $SERVER_PID 2>/dev/null || true
    exit 1
  fi
  sleep 1
done
