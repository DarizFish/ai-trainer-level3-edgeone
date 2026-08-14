#!/usr/bin/env bash
set -Eeuo pipefail

umask 022

readonly app_root="/srv/aitrainer"
readonly release_root="${app_root}/releases"
readonly upload_root="/home/deploy/uploads"
readonly service_name="aitrainer.service"
readonly nginx_conf="/etc/nginx/conf.d/aitrainer.conf"
readonly nginx_origin_conf="/etc/nginx/aitrainer-edgeone-origin.conf"
readonly unit_path="/etc/systemd/system/${service_name}"
readonly self_path="/usr/local/sbin/deploy-aitrainer"

# 把发布物里的一份基础设施文件装到位，只在内容真的不同时动手，并把原件备份下来。
# 返回 0 表示已更新，1 表示本来就一致。
install_if_changed() {
  local source="$1" target="$2" mode="$3" backup="$4"
  if [[ -f "${target}" ]] && cmp -s "${source}" "${target}"; then
    return 1
  fi
  if [[ -f "${target}" ]]; then
    cp -a "${target}" "${backup}"
  fi
  install -o root -g root -m "${mode}" "${source}" "${target}"
  return 0
}

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
  rm -f -- "${archive}" "${next_link}" "${unit_backup:-}" "${nginx_backup:-}" "${origin_backup:-}" 2>/dev/null || true
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
  [[ -f "${staging}/scripts/manage-database.mjs" ]] || { echo "database manager is missing" >&2; exit 10; }
  [[ -f "${staging}/drizzle/meta/_journal.json" ]] || { echo "migration journal is missing" >&2; exit 10; }
  # 基础设施配置随 artifact 下发。但不能把 deploy/ 设成硬性要求：早于这次改动的
  # 发布物里没有它，而回滚正是出事时最需要的能力——那时候拒绝部署等于把唯一的退路
  # 也堵死。所以只校验「有就必须是完整的一份」，半份配置才是打包出了问题。
  if [[ -d "${staging}/deploy" ]]; then
    [[ -f "${staging}/deploy/nginx/aitrainer.conf" ]] || { echo "nginx config is missing" >&2; exit 10; }
    [[ -f "${staging}/deploy/nginx/aitrainer-edgeone-origin.conf" ]] || { echo "EdgeOne origin ranges are missing" >&2; exit 10; }
    [[ -f "${staging}/deploy/systemd/${service_name}" ]] || { echo "systemd unit is missing" >&2; exit 10; }
    [[ -f "${staging}/deploy/scripts/deploy-release.sh" ]] || { echo "deploy script is missing" >&2; exit 10; }
  fi
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

# The database is shared by EdgeOne and this service. The migration command
# serializes every deployment target with the same PostgreSQL advisory lock,
# then validates the resulting schema before any release becomes active.
set -a
# shellcheck disable=SC1091
source /etc/aitrainer/aitrainer.env
set +a
(
  cd "${target}"
  node scripts/manage-database.mjs migrate
  node scripts/manage-database.mjs check
)

# 这一步之前的发布物里没有 deploy/，回滚到那些版本时不能因为找不到文件而失败。
# 缺就跳过并说清楚，服务器保持现有配置——降级到修复前的行为，而不是部署不了。
infra_root="${target}/deploy"
has_infra=0
if [[ -d "${infra_root}" ]]; then
  has_infra=1
else
  echo "release ${revision} predates artifact-delivered infrastructure; keeping the installed configuration" >&2
fi

# systemd unit 决定进程怎么起，必须在重启之前生效。备份留着，健康检查失败时要跟着
# 发布一起回滚——否则回滚只把代码换回去，进程仍然按新 unit 运行。
unit_backup="$(mktemp /run/aitrainer-unit-backup.XXXXXX)"
unit_changed=0
if [[ "${has_infra}" -eq 1 ]] && install_if_changed "${infra_root}/systemd/${service_name}" "${unit_path}" 0644 "${unit_backup}"; then
  unit_changed=1
  systemctl daemon-reload
  echo "updated ${unit_path}"
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
  if [[ "${unit_changed}" -eq 1 && -s "${unit_backup}" ]]; then
    install -o root -g root -m 0644 "${unit_backup}" "${unit_path}"
    systemctl daemon-reload
  fi
  if [[ -n "${previous}" && -d "${previous}" ]]; then
    previous_name="$(basename "${previous}")"
    ln -s "releases/${previous_name}" "${next_link}"
    mv -Tf -- "${next_link}" "${app_root}/current"
    systemctl restart "${service_name}"
  fi
  exit 12
fi
rm -f -- "${unit_backup}"

# Nginx 配置放在健康检查之后：它只描述边缘行为，坏掉的配置不该把一个已经健康的应用
# 拖下水。nginx -t 不过就原样还原，并让这次发布以失败告终——配置漂了必须是响的。
nginx_backup="$(mktemp /run/aitrainer-nginx-backup.XXXXXX)"
origin_backup="$(mktemp /run/aitrainer-origin-backup.XXXXXX)"
nginx_changed=0
if [[ "${has_infra}" -eq 1 ]]; then
  if install_if_changed "${infra_root}/nginx/aitrainer.conf" "${nginx_conf}" 0644 "${nginx_backup}"; then
    nginx_changed=1
  fi
  if install_if_changed "${infra_root}/nginx/aitrainer-edgeone-origin.conf" "${nginx_origin_conf}" 0644 "${origin_backup}"; then
    nginx_changed=1
  fi
fi
if [[ "${nginx_changed}" -eq 1 ]]; then
  if nginx -t; then
    systemctl reload nginx
    echo "updated nginx configuration and reloaded"
  else
    echo "new nginx configuration failed nginx -t; restoring the previous one" >&2
    if [[ -s "${nginx_backup}" ]]; then
      install -o root -g root -m 0644 "${nginx_backup}" "${nginx_conf}"
    fi
    if [[ -s "${origin_backup}" ]]; then
      install -o root -g root -m 0644 "${origin_backup}" "${nginx_origin_conf}"
    fi
    rm -f -- "${nginx_backup}" "${origin_backup}"
    nginx -t
    systemctl reload nginx
    exit 13
  fi
fi
rm -f -- "${nginx_backup}" "${origin_backup}"

# 自更新放在最后：这次发布自始至终用的是启动时那一份，新逻辑从下一次发布开始生效。
# 没有这一步，这个脚本本身就是唯一永远无法通过流水线更新的文件——正是它漂掉的原因。
if [[ "${has_infra}" -eq 1 ]] && ! cmp -s "${infra_root}/scripts/deploy-release.sh" "${self_path}"; then
  install -o root -g root -m 0755 "${infra_root}/scripts/deploy-release.sh" "${self_path}"
  echo "updated ${self_path}; it takes effect on the next deployment"
fi

curl -fsS http://127.0.0.1:3000/api/health/ready
echo
logger -t aitrainer-deploy "deployed ${revision} with sha256 ${expected_sha}"
