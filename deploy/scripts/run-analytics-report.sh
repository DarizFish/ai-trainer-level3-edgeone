#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

[[ ${EUID} -eq 0 ]] || { echo 'run as root' >&2; exit 1; }
day=${1:-}
[[ ${day} =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || { echo 'usage: run-analytics-report.sh YYYY-MM-DD' >&2; exit 2; }
export TZ=Asia/Shanghai
[[ $(date -d "${day}" +%F) == "${day}" ]] || exit 2
next_day=$(date -d "${day} +1 day" +%F)
read -r revision slot port < /var/lib/aitrainer-deploy/active
[[ ${revision} =~ ^[0-9a-f]{40}$ && ( ${slot} == blue || ${slot} == green ) ]] || exit 3
report_script=/srv/aitrainer/releases/${revision}/scripts/analytics-report.mjs
[[ -f ${report_script} ]] || { echo 'active release has no report script' >&2; exit 3; }
node_bin=/opt/node/bin/node
[[ -x ${node_bin} ]] || { echo 'Node 22 binary is missing' >&2; exit 3; }
temporary=$(mktemp -d /run/aitrainer-report.XXXXXX)
trap 'rm -rf -- "${temporary}"' EXIT
journalctl --quiet --no-pager --output=json --since "${day} 00:00:00" --until "${next_day} 00:00:00" \
  CONTAINER_NAME=aitrainer-green + CONTAINER_NAME=aitrainer-blue > "${temporary}/events.jsonl"
day_stamp=${day//-/}
next_stamp=${next_day//-/}
log_base=/var/log/nginx/aitrainer.access.log
logs=()
for candidate in "${log_base}-${day_stamp}" "${log_base}-${day_stamp}.gz" \
  "${log_base}-${next_stamp}" "${log_base}-${next_stamp}.gz" "${log_base}"; do
  [[ -f ${candidate} ]] && logs+=("${candidate}")
done
[[ ${#logs[@]} -gt 0 ]] || { echo 'Nginx access log files for this day are unavailable' >&2; exit 4; }
gzip -cdf "${logs[@]}" > "${temporary}/access.log"
set -a
# The environment file is root-owned and already used by the production deploy.
# shellcheck disable=SC1091
source /etc/aitrainer/aitrainer.env
set +a
unset DIRECT_URL
"${node_bin}" "${report_script}" --from "${day}T00:00:00+08:00" --to "${next_day}T00:00:00+08:00" \
  --events "${temporary}/events.jsonl" --access "${temporary}/access.log" --revision "${revision}"
