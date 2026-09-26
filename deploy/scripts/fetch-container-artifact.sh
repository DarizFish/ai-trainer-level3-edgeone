#!/usr/bin/env bash
set -Eeuo pipefail

# The URL arrives on stdin so it never appears in the SSH command or Actions log.
umask 077
revision=${1:-}
expected_digest=${2:-}
[[ ${revision} =~ ^[0-9a-f]{40}$ && ${expected_digest} =~ ^[0-9a-f]{64}$ ]] || exit 2
IFS= read -r artifact_url
[[ ${artifact_url} =~ ^https://[a-z0-9-]+\.blob\.core\.windows\.net/ ]] || {
  echo 'unexpected artifact download host' >&2; exit 2;
}
[[ ${artifact_url} != *\"* && ${artifact_url} != *\\* && ${artifact_url} != *$'\r'* ]] || exit 2

upload_root=/home/deploy/uploads
archive=$(mktemp "${upload_root}/.aitrainer-${revision}.XXXXXX.zip")
extract_root=$(mktemp -d "${upload_root}/.aitrainer-${revision}.XXXXXX")
trap 'rm -f -- "${archive}"; rm -rf -- "${extract_root}"' EXIT

printf 'url = "%s"\n' "${artifact_url}" | \
  curl --config - --fail --silent --show-error --connect-timeout 15 --max-time 2400 \
    --retry 3 --retry-connrefused --output "${archive}"
actual_digest=$(sha256sum "${archive}" | cut -d ' ' -f 1)
[[ ${actual_digest} == "${expected_digest}" ]] || {
  echo 'GitHub artifact digest mismatch' >&2; exit 3;
}

release_name="aitrainer-${revision}.tar.gz"
image_name="aitrainer-image-${revision}.tar.gz"
mapfile -t members < <(unzip -Z1 "${archive}")
[[ ${#members[@]} -eq 2 ]] || { echo 'artifact member count mismatch' >&2; exit 3; }
[[ ${members[0]} == "${release_name}" && ${members[1]} == "${image_name}" || \
   ${members[0]} == "${image_name}" && ${members[1]} == "${release_name}" ]] || {
  echo 'unexpected artifact members' >&2; exit 3;
}
unzip -q "${archive}" -d "${extract_root}"
[[ -s ${extract_root}/${release_name} && -s ${extract_root}/${image_name} ]] || exit 3
release_sha=$(sha256sum "${extract_root}/${release_name}" | cut -d ' ' -f 1)
image_sha=$(sha256sum "${extract_root}/${image_name}" | cut -d ' ' -f 1)
mv -f -- "${extract_root}/${release_name}" "${upload_root}/${release_name}"
mv -f -- "${extract_root}/${image_name}" "${upload_root}/${image_name}"
printf '%s %s\n' "${release_sha}" "${image_sha}"
