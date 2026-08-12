#!/usr/bin/env bash
set -Eeuo pipefail

umask 022

readonly app_root="/srv/aitrainer"
readonly release_root="${app_root}/releases"
readonly upload_root="/home/deploy/uploads"
readonly service_name="aitrainer.service"

revision="${1:-}"
expected_sha="${2:-}"

if [[ ! "${revision}" =~ ^[0-9a-f]{40}$ ]]; then
  echo "revision must be a full lowercase Git SHA" >&2
  exit 2
fi
if [[ ! "${expected_sha}" =~ ^[0-9a-f]{64}$ ]]; then
  echo "archive checksum must be a lowercase SHA-256" >&2
  exit 2
fi

exec 9>/run/lock/aitrainer-deploy.lock
if ! flock -n 9; then
  echo "another deployment is already running" >&2
  exit 3
fi

archive="${upload_root}/aitrainer-${revision}.tar.gz"
target="${release_root}/${revision}"
staging=""
next_link="${app_root}/.current-${revision}"

cleanup() {
  rm -f -- "${archive}" "${next_link}"
  if [[ -n "${staging}" && -d "${staging}" ]]; then
    rm -rf -- "${staging}"
  fi
}
trap cleanup EXIT

if [[ ! -f "${archive}" ]]; then
  echo "release archive is missing: ${archive}" >&2
  exit 4
fi

actual_sha="$(sha256sum "${archive}" | cut -d ' ' -f 1)"
if [[ "${actual_sha}" != "${expected_sha}" ]]; then
  echo "release checksum mismatch" >&2
  exit 5
fi

previous=""
if [[ -L "${app_root}/current" ]]; then
  previous="$(readlink -f "${app_root}/current")"
  if [[ "${previous}" != "${release_root}/"* ]]; then
    echo "current release points outside ${release_root}" >&2
    exit 6
  fi
fi

if [[ -d "${target}" ]]; then
  if [[ ! -f "${target}/.release-sha256" ]] || [[ "$(<"${target}/.release-sha256")" != "${expected_sha}" ]]; then
    echo "existing release does not match this archive" >&2
    exit 7
  fi
  echo "reusing verified release ${revision}"
else
  if tar -tzf "${archive}" | grep -Eq '(^|/)\.\.(/|$)|^/'; then
    echo "release archive contains an unsafe path" >&2
    exit 8
  fi

  staging="$(mktemp -d "${release_root}/.${revision}.XXXXXX")"
  chown aitrainer:aitrainer "${staging}"
  # /home/deploy is intentionally not traversable by the service account.
  # Copy the verified archive into its private staging directory, then keep
  # extraction unprivileged so a malicious tar member cannot write as root.
  staging_archive="${staging}/.release.tar.gz"
  install -o aitrainer -g aitrainer -m 0400 "${archive}" "${staging_archive}"
  runuser -u aitrainer -- tar -xzf "${staging_archive}" -C "${staging}" --no-same-owner --no-same-permissions
  rm -f -- "${staging_archive}"

  if find "${staging}" -type l -print -quit | grep -q .; then
    echo "release archive must not contain symbolic links" >&2
    exit 9
  fi
  [[ -f "${staging}/server.js" ]] || { echo "server.js is missing" >&2; exit 10; }
  [[ -d "${staging}/.next/static" ]] || { echo ".next/static is missing" >&2; exit 10; }
  [[ -d "${staging}/public" ]] || { echo "public directory is missing" >&2; exit 10; }
  grep -Fqx "Source revision: ${revision}" "${staging}/DEPLOYMENT.txt" || {
    echo "release metadata does not match ${revision}" >&2
    exit 11
  }

  printf '%s\n' "${expected_sha}" > "${staging}/.release-sha256"
  chown -R aitrainer:aitrainer "${staging}"
  chmod -R u=rwX,go=rX "${staging}"
  mv -- "${staging}" "${target}"
  staging=""
fi

ln -s "releases/${revision}" "${next_link}"
mv -Tf -- "${next_link}" "${app_root}/current"
systemctl restart "${service_name}"

ready=0
for _attempt in {1..60}; do
  if curl -fsS --max-time 3 http://127.0.0.1:3000/api/health/ready >/dev/null; then
    ready=1
    break
  fi
  sleep 1
done

if [[ "${ready}" -ne 1 ]]; then
  echo "new release did not become ready; rolling back" >&2
  journalctl -u "${service_name}" -n 50 --no-pager >&2 || true
  if [[ -n "${previous}" && -d "${previous}" ]]; then
    previous_name="$(basename "${previous}")"
    ln -s "releases/${previous_name}" "${next_link}"
    mv -Tf -- "${next_link}" "${app_root}/current"
    systemctl restart "${service_name}"
  fi
  exit 12
fi

curl -fsS http://127.0.0.1:3000/api/health/ready
echo
logger -t aitrainer-deploy "deployed ${revision} with sha256 ${expected_sha}"
