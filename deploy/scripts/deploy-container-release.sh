#!/usr/bin/env bash
set -Eeuo pipefail

# Stage the inactive slot without changing Nginx, current, or the live process.
umask 077
readonly app_root=/srv/aitrainer
readonly release_root=${app_root}/releases
readonly static_release_root=${app_root}/static-releases
readonly upload_root=/home/deploy/uploads
readonly state_root=/var/lib/aitrainer-deploy
readonly env_file=/etc/aitrainer/aitrainer.env
readonly nginx_conf=/etc/nginx/conf.d/aitrainer.conf
readonly self_path=/usr/local/sbin/deploy-aitrainer-container
readonly switch_path=/usr/local/sbin/switch-aitrainer-container

revision=${1:-}
release_sha=${2:-}
image_sha=${3:-}
[[ ${revision} =~ ^[0-9a-f]{40}$ ]] || { echo 'revision must be a full Git SHA' >&2; exit 2; }
[[ ${release_sha} =~ ^[0-9a-f]{64}$ && ${image_sha} =~ ^[0-9a-f]{64}$ ]] || {
  echo 'both artifact checksums must be SHA-256' >&2; exit 2;
}

exec 9>/run/lock/aitrainer-deploy.lock
flock -n 9 || { echo 'another deployment is running' >&2; exit 3; }

release_archive=${upload_root}/aitrainer-${revision}.tar.gz
image_archive=${upload_root}/aitrainer-image-${revision}.tar.gz
target=${release_root}/${revision}
staging=''
static_staging=''
runtime_env=''
migration_env=''
members_file=''
nginx_test=''
candidate_created=0
pending_written=0
staged=0

cleanup() {
  local result=$?
  trap - EXIT
  set +e
  if [[ ${staged} -eq 0 ]]; then
    if [[ ${pending_written} -eq 1 ]]; then rm -f -- "${state_root}/pending"; fi
    if [[ ${candidate_created} -eq 1 ]]; then
      docker logs --tail 50 "${candidate_name}" >&2
      docker rm -f "${candidate_name}" >/dev/null
    fi
  fi
  rm -f -- "${release_archive}" "${image_archive}" "${runtime_env}" "${migration_env}" "${members_file}" "${nginx_test}" 2>/dev/null || true
  if [[ -n ${staging} && -d ${staging} ]]; then rm -rf -- "${staging}"; fi
  if [[ -n ${static_staging} && -d ${static_staging} ]]; then rm -rf -- "${static_staging}"; fi
  exit "${result}"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

for program in docker nginx curl sha256sum runuser systemctl; do
  command -v "${program}" >/dev/null || { echo "missing required command: ${program}" >&2; exit 4; }
done
docker info >/dev/null
[[ -f ${env_file} && -f ${release_archive} && -f ${image_archive} ]] || {
  echo 'database environment or verified artifact is missing' >&2; exit 4;
}
[[ $(sha256sum "${release_archive}" | cut -d ' ' -f 1) == "${release_sha}" ]] || {
  echo 'release archive checksum mismatch' >&2; exit 5;
}
[[ $(sha256sum "${image_archive}" | cut -d ' ' -f 1) == "${image_sha}" ]] || {
  echo 'container image checksum mismatch' >&2; exit 5;
}

install -d -o root -g root -m 0700 "${state_root}" "${state_root}/nginx"
[[ ! -e ${state_root}/pending && ! -e ${state_root}/switch-in-progress ]] || {
  echo 'resolve the pending candidate or interrupted switch first' >&2; exit 6;
}
if [[ -f ${state_root}/active ]]; then
  read -r active_revision active_slot active_port < "${state_root}/active"
  [[ ${active_revision} =~ ^[0-9a-f]{40}$ && ${active_port} =~ ^300[01]$ ]] || exit 6
  [[ ${active_slot} == blue || ${active_slot} == green ]] || exit 6
  grep -Fq "proxy_pass http://127.0.0.1:${active_port};" "${nginx_conf}" || {
    echo 'active state and Nginx disagree' >&2; exit 6;
  }
else
  active_port=3000
  systemctl is-active --quiet aitrainer.service || {
    echo 'legacy service is not running' >&2; exit 6;
  }
  grep -Fq 'proxy_pass http://127.0.0.1:3000;' "${nginx_conf}" || {
    echo 'legacy Nginx upstream differs from the expected baseline' >&2; exit 6;
  }
fi
if [[ ${active_port} == 3000 ]]; then
  candidate_port=3001
  candidate_slot=green
else
  candidate_port=3000
  candidate_slot=blue
fi
candidate_name=aitrainer-${candidate_slot}
if docker container inspect "${candidate_name}" >/dev/null 2>&1; then
  echo "inactive slot ${candidate_name} is occupied; retire it after the rollback window" >&2
  exit 6
fi
if [[ ${candidate_port} == 3000 ]] && systemctl is-active --quiet aitrainer.service; then
  echo 'legacy service still owns port 3000; retire it before staging the blue slot' >&2
  exit 6
fi
if docker container inspect aitrainer >/dev/null 2>&1; then
  echo 'an older single-container deployment exists; reconcile it before staging' >&2
  exit 6
fi
curl -fsS --max-time 5 http://127.0.0.1/api/health/ready >/dev/null || {
  echo 'live route is not ready before staging' >&2; exit 6;
}
live_static_before=$(curl -fsS --max-time 10 http://127.0.0.1/lite/lab/index.html | sha256sum | cut -d ' ' -f 1)

if [[ -d ${target} ]]; then
  [[ -f ${target}/.release-sha256 && $(<"${target}/.release-sha256") == "${release_sha}" ]] || {
    echo 'existing release differs from the verified artifact' >&2; exit 7;
  }
else
  members_file=$(mktemp /run/aitrainer-archive-members.XXXXXX)
  tar -tzf "${release_archive}" > "${members_file}"
  if grep -Eq '(^|/)\.\.(/|$)|^/' "${members_file}"; then
    echo 'release archive contains an unsafe path' >&2; exit 8
  fi
  staging=$(mktemp -d "${release_root}/.${revision}.XXXXXX")
  chown aitrainer:aitrainer "${staging}"
  install -o aitrainer -g aitrainer -m 0400 "${release_archive}" "${staging}/.release.tar.gz"
  runuser -u aitrainer -- tar -xzf "${staging}/.release.tar.gz" -C "${staging}" --no-same-owner --no-same-permissions
  rm -f -- "${staging}/.release.tar.gz"
  if find "${staging}" -type l -print -quit | grep -q .; then
    echo 'release archive contains a symlink' >&2; exit 8
  fi
  for required in server.js .next/static public scripts/manage-database.mjs drizzle/meta/_journal.json deploy/nginx/aitrainer.conf deploy/nginx/aitrainer-edgeone-origin.conf deploy/scripts/deploy-container-release.sh deploy/scripts/switch-container-release.sh; do
    [[ -e ${staging}/${required} ]] || { echo "missing release member: ${required}" >&2; exit 9; }
  done
  grep -Fqx "Source revision: ${revision}" "${staging}/DEPLOYMENT.txt" || {
    echo 'release metadata differs from requested revision' >&2; exit 9;
  }
  printf '%s\n' "${release_sha}" > "${staging}/.release-sha256"
  chown -R aitrainer:aitrainer "${staging}"
  chmod -R u=rwX,go=rX "${staging}"
  mv -- "${staging}" "${target}"
  staging=''
fi

# A one-shot container runs migrations under the existing advisory lock. Only
# that container receives DIRECT_URL; the serving container does not.
gzip -dc "${image_archive}" | docker load >/dev/null
image=aitrainer:${revision}
[[ $(docker image inspect "${image}" --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}') == "${revision}" ]] || {
  echo 'loaded image revision mismatch' >&2; exit 10;
}
env_keys=()
while IFS= read -r line || [[ -n ${line} ]]; do
  [[ ${line} =~ ^[[:space:]]*(#|$) ]] && continue
  [[ ${line} =~ ^([A-Za-z_][A-Za-z0-9_]*)= ]] || {
    echo 'environment file must contain only KEY=value assignments' >&2; exit 10;
  }
  env_keys+=("${BASH_REMATCH[1]}")
done < "${env_file}"
runtime_env=$(mktemp /run/aitrainer-runtime-env.XXXXXX)
migration_env=$(mktemp /run/aitrainer-migration-env.XXXXXX)
(
  set -a
  # shellcheck disable=SC1090
  source "${env_file}"
  set +a
  [[ -n ${DATABASE_URL:-} && -n ${DIRECT_URL:-} ]] || {
    echo 'DATABASE_URL and DIRECT_URL are required' >&2; exit 10;
  }
  for key in "${env_keys[@]}"; do
    value=${!key}
    [[ ${value} != *$'\n'* && ${value} != *$'\r'* ]] || {
      echo "environment value contains a newline: ${key}" >&2; exit 10;
    }
    printf '%s=%s\n' "${key}" "${value}" >> "${migration_env}"
    if [[ ${key} != DIRECT_URL ]]; then
      printf '%s=%s\n' "${key}" "${value}" >> "${runtime_env}"
    fi
  done
)
docker run --rm --env-file "${migration_env}" --entrypoint node "${image}" scripts/manage-database.mjs migrate
docker run --rm --env-file "${migration_env}" --entrypoint node "${image}" scripts/manage-database.mjs check
curl -fsS --max-time 5 http://127.0.0.1/api/health/ready >/dev/null || {
  echo 'old release is not ready after the migration; do not switch traffic' >&2; exit 10;
}
docker run --detach --name "${candidate_name}" --restart unless-stopped \
  --publish "127.0.0.1:${candidate_port}:3000" --env-file "${runtime_env}" \
  --env HOSTNAME=0.0.0.0 --env PORT=3000 --env NODE_ENV=production \
  --env DATABASE_POOL_MAX=10 --env TRUSTED_CLIENT_IP_HEADER=x-real-ip \
  --log-driver journald --security-opt no-new-privileges --cap-drop ALL \
  --pids-limit 256 --stop-timeout 30 "${image}" >/dev/null
candidate_created=1
ready=0
for _attempt in {1..60}; do
  if curl -fsS --max-time 3 "http://127.0.0.1:${candidate_port}/api/health/ready" >/dev/null; then
    ready=1
    break
  fi
  sleep 1
done
[[ ${ready} -eq 1 ]] || { echo 'candidate did not become ready' >&2; exit 11; }

# Retain the previous release's files that may still be requested by open
# pages. Mutable paths take the new release's bytes; immutable URL collisions
# must retain identical bytes or the CDN contract is invalid.
if [[ -f ${state_root}/active ]]; then
  old_release=${release_root}/${active_revision}
else
  old_release=$(readlink -f "${app_root}/current")
fi
[[ ${old_release} == "${release_root}/"* && -d ${old_release}/public && -d ${old_release}/.next/static ]] || {
  echo 'cannot identify the active release for static-file continuity' >&2; exit 12;
}
for immutable in .next/static public/content public/lite/static public/lite/build public/labs/models public/labs/runtime; do
  [[ -d ${old_release}/${immutable} ]] || continue
  while IFS= read -r -d '' old_file; do
    relative=${old_file#"${old_release}/${immutable}/"}
    case "${immutable}/${relative}" in
      public/lite/static/pyodide/pyodide.js|\
      public/lite/static/pyodide/pyodide.asm.js|\
      public/lite/static/pyodide/pyodide.mjs|\
      public/lite/static/pyodide/pyodide-lock.json|\
      public/lite/static/pyodide/pyodide.asm.wasm|\
      public/lite/static/pyodide/python_stdlib.zip)
        continue ;;
    esac
    new_file=${target}/${immutable}/${relative}
    if [[ -f ${new_file} ]] && ! cmp -s "${old_file}" "${new_file}"; then
      echo "immutable static URL changed bytes: ${immutable}/${relative}" >&2
      exit 12
    fi
  done < <(find "${old_release}/${immutable}" -type f -print0)
done
install -d -o root -g root -m 0755 "${static_release_root}"
static_root=${static_release_root}/${revision}
if [[ -d ${static_root} ]]; then
  [[ -f ${static_root}/.release-sha256 && $(<"${static_root}/.release-sha256") == "${release_sha}" ]] || {
    echo 'existing static union differs from verified release' >&2; exit 12;
  }
else
  static_staging=$(mktemp -d "${static_release_root}/.${revision}.XXXXXX")
  install -d -m 0755 "${static_staging}/.next/static" "${static_staging}/public"
  cp -a "${target}/.next/static/." "${static_staging}/.next/static/"
  cp -a "${target}/public/." "${static_staging}/public/"
  cp -an "${old_release}/.next/static/." "${static_staging}/.next/static/"
  cp -an "${old_release}/public/." "${static_staging}/public/"
  printf '%s\n' "${release_sha}" > "${static_staging}/.release-sha256"
  chown -R root:root "${static_staging}"
  chmod -R u=rwX,go=rX "${static_staging}"
  mv -- "${static_staging}" "${static_root}"
  static_staging=''
fi

# A single Nginx config owns the upstream and every static root. When reloaded,
# old workers keep the old routing while new requests see one consistent version.
template=${target}/deploy/nginx/aitrainer.conf
[[ $(grep -Fc '/srv/aitrainer/current' "${template}") -eq 5 ]] || exit 12
[[ $(grep -Fc 'proxy_pass http://127.0.0.1:3000;' "${template}") -eq 1 ]] || exit 12
[[ $(grep -Fc 'include /etc/nginx/aitrainer-edgeone-origin.conf;' "${template}") -eq 1 ]] || exit 12
origin_path=${state_root}/nginx/${revision}.origins.conf
candidate_conf=${state_root}/nginx/${revision}.conf
install -o root -g root -m 0644 "${target}/deploy/nginx/aitrainer-edgeone-origin.conf" "${origin_path}"
{
  printf '# aitrainer revision=%s slot=%s port=%s\n' "${revision}" "${candidate_slot}" "${candidate_port}"
  sed -e "s@/srv/aitrainer/current@${static_root}@g" \
      -e "s@proxy_pass http://127.0.0.1:3000;@proxy_pass http://127.0.0.1:${candidate_port};@" \
      -e "s@/etc/nginx/aitrainer-edgeone-origin.conf@${origin_path}@g" "${template}"
} > "${candidate_conf}"
chmod 0644 "${candidate_conf}"
nginx_test=$(mktemp /run/aitrainer-nginx-test.XXXXXX)
printf 'events {}\nhttp { include /etc/nginx/mime.types; include %s; }\n' "${candidate_conf}" > "${nginx_test}"
nginx -t -c "${nginx_test}"
live_static_after=$(curl -fsS --max-time 10 http://127.0.0.1/lite/lab/index.html | sha256sum | cut -d ' ' -f 1)
[[ ${live_static_before} == "${live_static_after}" ]] || {
  echo 'live Nginx static content changed during staging' >&2; exit 12;
}

pending_temp=$(mktemp "${state_root}/.pending.XXXXXX")
printf '%s %s %s %s %s\n' "${revision}" "${candidate_slot}" "${candidate_port}" "${release_sha}" "${image_sha}" > "${pending_temp}"
chmod 0600 "${pending_temp}"
mv -f -- "${pending_temp}" "${state_root}/pending"
pending_written=1
install -o root -g root -m 0755 "${target}/deploy/scripts/deploy-container-release.sh" "${self_path}"
install -o root -g root -m 0700 "${target}/deploy/scripts/switch-container-release.sh" "${switch_path}"
staged=1
logger -t aitrainer-deploy "staged container ${revision} in ${candidate_slot} on 127.0.0.1:${candidate_port}; live traffic unchanged" || true
echo "STAGED revision=${revision} slot=${candidate_slot} port=${candidate_port}; Nginx and current release unchanged"
