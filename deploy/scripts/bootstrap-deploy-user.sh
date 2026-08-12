#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "run this script as root" >&2
  exit 1
fi

public_key="${DEPLOY_PUBLIC_KEY:-}"
release_script="${1:-}"

if [[ ! "${public_key}" =~ ^ssh-ed25519\ [A-Za-z0-9+/]+={0,3}(\ .*)?$ ]]; then
  echo "DEPLOY_PUBLIC_KEY must contain one ssh-ed25519 public key" >&2
  exit 2
fi
if [[ ! -f "${release_script}" ]]; then
  echo "pass the deploy-release.sh path as the first argument" >&2
  exit 2
fi

if ! id deploy >/dev/null 2>&1; then
  useradd --create-home --shell /bin/bash deploy
fi
passwd --lock deploy >/dev/null

install -d -o deploy -g deploy -m 0700 /home/deploy/.ssh
printf 'restrict %s\n' "${public_key}" > /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys
chmod 0600 /home/deploy/.ssh/authorized_keys
install -d -o deploy -g deploy -m 0750 /home/deploy/uploads

install -o root -g root -m 0755 "${release_script}" /usr/local/sbin/deploy-aitrainer
printf '%s\n' 'deploy ALL=(root) NOPASSWD: /usr/local/sbin/deploy-aitrainer' > /etc/sudoers.d/aitrainer-deploy
chmod 0440 /etc/sudoers.d/aitrainer-deploy
visudo -cf /etc/sudoers.d/aitrainer-deploy >/dev/null

# The service may read releases, but only the root deployment command may
# replace the active symlink or create a new immutable release directory.
chown root:root /srv/aitrainer /srv/aitrainer/releases
chmod 0755 /srv/aitrainer /srv/aitrainer/releases

echo "deploy user and restricted sudo command are ready"
