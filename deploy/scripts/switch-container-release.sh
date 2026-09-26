#!/usr/bin/env bash
set -Eeuo pipefail

# Root-only final traffic switch. The staging workflow never calls this file.
umask 077
readonly state_root=/var/lib/aitrainer-deploy
readonly nginx_conf=/etc/nginx/conf.d/aitrainer.conf
readonly release_root=/srv/aitrainer/releases
[[ ${EUID} -eq 0 ]] || { echo 'run as root' >&2; exit 1; }
exec 9>/run/lock/aitrainer-deploy.lock
flock -n 9 || { echo 'another deployment is running' >&2; exit 3; }

action=${1:-}
revision=${2:-}
[[ ${action} == switch || ${action} == rollback ]] || {
  echo 'usage: switch-aitrainer-container switch <revision> | rollback' >&2; exit 2;
}
for program in docker nginx curl systemctl; do
  command -v "${program}" >/dev/null || { echo "missing required command: ${program}" >&2; exit 4; }
done

active_port() {
  if [[ -f ${state_root}/active ]]; then
    read -r _revision _slot _port < "${state_root}/active"
    [[ ${_revision} =~ ^[0-9a-f]{40}$ && ${_port} =~ ^300[01]$ ]] || return 1
    printf '%s\n' "${_port}"
  else
    printf '3000\n'
  fi
}
wait_local() {
  local port=$1
  for _attempt in {1..12}; do
    if curl -fsS --max-time 3 "http://127.0.0.1:${port}/api/health/ready" >/dev/null; then return 0; fi
    sleep 1
  done
  return 1
}
wait_public() {
  for _attempt in {1..12}; do
    if curl -fsS --max-time 3 http://127.0.0.1/api/health/ready >/dev/null; then return 0; fi
    sleep 1
  done
  return 1
}
install_nginx_conf() {
  local source=$1 temporary
  temporary=$(mktemp /etc/nginx/conf.d/.aitrainer-route.XXXXXX)
  install -o root -g root -m 0644 "${source}" "${temporary}"
  mv -Tf -- "${temporary}" "${nginx_conf}"
}

if [[ ${action} == rollback ]]; then
  [[ -f ${state_root}/rollback-nginx.conf && -f ${state_root}/rollback-active ]] || {
    echo 'there is no recorded previous route' >&2; exit 5;
  }
  previous_port=$(sed -n 's/^[[:space:]]*proxy_pass http:\/\/127\.0\.0\.1:\(300[01]\);/\1/p' "${state_root}/rollback-nginx.conf")
  [[ ${previous_port} =~ ^300[01]$ ]] || { echo 'previous route is invalid' >&2; exit 5; }
  wait_local "${previous_port}" || { echo 'previous instance is not ready; rollback would cause an outage' >&2; exit 6; }
  current_backup=$(mktemp /run/aitrainer-current-nginx.XXXXXX)
  cp -a "${nginx_conf}" "${current_backup}"
  restore_active=0
  if [[ -s ${state_root}/rollback-active ]]; then restore_active=1; fi
  if ! install_nginx_conf "${state_root}/rollback-nginx.conf" ||
     ! nginx -t ||
     ! systemctl reload nginx ||
     ! wait_public; then
    install_nginx_conf "${current_backup}"
    nginx -t && systemctl reload nginx || true
    rm -f -- "${current_backup}"
    echo 'rollback failed; attempted to restore the current route' >&2
    exit 7
  fi
  if [[ ${restore_active} -eq 1 ]]; then
    install -o root -g root -m 0600 "${state_root}/rollback-active" "${state_root}/active"
  else
    rm -f -- "${state_root}/active"
  fi
  rm -f -- "${state_root}/switch-in-progress" "${current_backup}"
  logger -t aitrainer-deploy "restored previous route on port ${previous_port}" || true
  echo "ROLLED BACK: previous route on 127.0.0.1:${previous_port}; both instances remain available"
  exit 0
fi

[[ ${revision} =~ ^[0-9a-f]{40}$ ]] || { echo 'revision must be a full Git SHA' >&2; exit 2; }
[[ -f ${state_root}/pending && ! -e ${state_root}/switch-in-progress ]] || {
  echo 'no staged candidate, or an interrupted switch needs reconciliation' >&2; exit 5;
}
read -r pending_revision slot port release_sha image_sha < "${state_root}/pending"
[[ ${pending_revision} == "${revision}" && ${slot} =~ ^(blue|green)$ && ${port} =~ ^300[01]$ ]] || {
  echo 'staged candidate does not match requested revision' >&2; exit 5;
}
[[ ${release_sha} =~ ^[0-9a-f]{64}$ && ${image_sha} =~ ^[0-9a-f]{64}$ ]] || exit 5
target=${release_root}/${revision}
[[ -f ${target}/.release-sha256 && $(<"${target}/.release-sha256") == "${release_sha}" ]] || exit 5
static_root=/srv/aitrainer/static-releases/${revision}
[[ -f ${static_root}/.release-sha256 && $(<"${static_root}/.release-sha256") == "${release_sha}" ]] || exit 5
candidate_conf=${state_root}/nginx/${revision}.conf
[[ -f ${candidate_conf} ]] || { echo 'rendered Nginx config is missing' >&2; exit 5; }
grep -Fqx "# aitrainer revision=${revision} slot=${slot} port=${port}" "${candidate_conf}" || exit 5
grep -Fq "proxy_pass http://127.0.0.1:${port};" "${candidate_conf}" || exit 5
grep -Fq "alias ${static_root}/.next/static/;" "${candidate_conf}" || exit 5
[[ $(docker container inspect "aitrainer-${slot}" --format '{{.State.Running}}') == true ]] || {
  echo 'candidate container is not running' >&2; exit 6;
}
[[ $(docker container inspect "aitrainer-${slot}" --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}') == "${revision}" ]] || {
  echo 'candidate image revision differs from staging record' >&2; exit 6;
}
old_port=$(active_port)
[[ ${old_port} != "${port}" ]] || { echo 'candidate and active ports are the same' >&2; exit 6; }
grep -Fq "proxy_pass http://127.0.0.1:${old_port};" "${nginx_conf}" || {
  echo 'active Nginx route changed since staging' >&2; exit 6;
}
wait_local "${old_port}" || { echo 'old instance is not ready for rollback' >&2; exit 6; }
wait_local "${port}" || { echo 'candidate is no longer ready' >&2; exit 6; }

install -o root -g root -m 0644 "${nginx_conf}" "${state_root}/rollback-nginx.conf"
if [[ -f ${state_root}/active ]]; then
  install -o root -g root -m 0600 "${state_root}/active" "${state_root}/rollback-active"
else
  : > "${state_root}/rollback-active"
fi
printf '%s\n' "${revision}" > "${state_root}/switch-in-progress"
switched=0
cleanup_switch() {
  local result=$?
  trap - EXIT
  if [[ ${switched} -eq 0 ]]; then
    if install_nginx_conf "${state_root}/rollback-nginx.conf" &&
       nginx -t &&
       systemctl reload nginx; then
      rm -f -- "${state_root}/switch-in-progress"
      echo 'cutover failed; restored the previous Nginx route' >&2
    else
      echo 'cutover failed and route restoration needs manual intervention' >&2
    fi
  fi
  exit "${result}"
}
trap cleanup_switch EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

install_nginx_conf "${candidate_conf}"
nginx -t
systemctl reload nginx
wait_public
expected_static=$(sha256sum "${target}/public/lite/lab/index.html" | cut -d ' ' -f 1)
served_static=$(curl -fsS --max-time 10 http://127.0.0.1/lite/lab/index.html | sha256sum | cut -d ' ' -f 1)
[[ ${expected_static} == "${served_static}" ]] || {
  echo 'Nginx is serving static files from a different release' >&2; exit 7;
}
active_temp=$(mktemp "${state_root}/.active.XXXXXX")
printf '%s %s %s\n' "${revision}" "${slot}" "${port}" > "${active_temp}"
chmod 0600 "${active_temp}"
mv -f -- "${active_temp}" "${state_root}/active"
switched=1
rm -f -- "${state_root}/pending" "${state_root}/switch-in-progress" || {
  echo 'traffic switched, but staging marker cleanup requires attention' >&2;
}
logger -t aitrainer-deploy "switched traffic to container ${revision} on port ${port}; old instance retained" || true
echo "SWITCHED revision=${revision} slot=${slot} port=${port}; old instance retained for rollback"
