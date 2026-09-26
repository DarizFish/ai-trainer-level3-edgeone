#!/usr/bin/env bash
set -Eeuo pipefail

if [[ ${EUID} -ne 0 ]]; then echo 'run as root' >&2; exit 1; fi
script=${1:-}
[[ -f ${script} ]] || { echo 'pass the checked-out deploy-container-release.sh path' >&2; exit 2; }
docker info >/dev/null || { echo 'Docker Engine must be installed and running' >&2; exit 3; }
[[ -d /srv/aitrainer/releases && -f /etc/aitrainer/aitrainer.env ]] || {
  echo 'the existing self-hosted release and environment must be present' >&2; exit 3;
}
install -o root -g root -m 0755 "${script}" /usr/local/sbin/deploy-aitrainer-container
sudoers_candidate=$(mktemp /run/aitrainer-sudoers.XXXXXX)
trap 'rm -f -- "${sudoers_candidate}"' EXIT
printf '%s\n' 'deploy ALL=(root) NOPASSWD: /usr/local/sbin/deploy-aitrainer-container' \
  > "${sudoers_candidate}"
chmod 0440 "${sudoers_candidate}"
visudo -cf "${sudoers_candidate}" >/dev/null
install -o root -g root -m 0440 "${sudoers_candidate}" /etc/sudoers.d/aitrainer-container-deploy
echo 'container staging command installed; it cannot switch public traffic'
