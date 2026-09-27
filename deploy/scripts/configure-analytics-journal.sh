#!/usr/bin/env bash
set -Eeuo pipefail

[[ ${EUID} -eq 0 ]] || { echo 'run as root' >&2; exit 1; }
source_file=${1:-}
[[ -f ${source_file} ]] || { echo 'pass the checked-out journald config path' >&2; exit 2; }
target=/etc/systemd/journald.conf.d/aitrainer-analytics.conf
install -d -o root -g root -m 0755 /etc/systemd/journald.conf.d
install -o root -g root -m 0644 "${source_file}" "${target}"
systemctl restart systemd-journald
systemd-analyze cat-config systemd/journald.conf | grep -F 'MaxRetentionSec=30day' >/dev/null
systemd-analyze cat-config systemd/journald.conf | grep -F 'MaxFileSec=1day' >/dev/null
echo 'journald persists and rotates structured container events with 30-day retention'
