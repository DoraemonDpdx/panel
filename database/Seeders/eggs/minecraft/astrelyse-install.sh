#!/bin/bash
# Astrelyse Minecraft install script.
#
# Runs in the install container (eclipse-temurin:21-jdk-jammy) with the server's files at /mnt/server.
#
# With /mnt/server/.astrelyse/plan.json present and ASTRELYSE_PLAN_SHA256 matching its sha256, it follows the
# plan written by the panel:
#   verify -> moves -> wipe -> remove -> software -> files -> archives -> eula -> delete the plan
# With no plan, it does a plain software install from SERVER_TYPE, MC_VERSION, LOADER_VERSION and SERVER_JARFILE,
# so stock reinstalls keep working.
#
# Startup: the script writes /mnt/server/start.sh, and the egg startup runs it (falling back to a plain
# `java -jar` when it is missing). Forge and NeoForge 1.17+ keep their JVM flags in user_jvm_args.txt.
#
# Safety rules, all enforced again here even though the panel enforces them when it builds the plan:
#   - downloads only from the host allowlist below, over https, with no userinfo or port, and no redirect off it
#   - every path stays inside /mnt/server (no .., no absolute paths, no symlinks)
#   - every file is checked against its sha1, sha256, sha512 or md5 and the install fails on a mismatch
set -euo pipefail

ROOT=/mnt/server
ASTRELYSE_DIR="$ROOT/.astrelyse"
PLAN="$ASTRELYSE_DIR/plan.json"
WORK="$ASTRELYSE_DIR/tmp"
UA="astrelyse-installer/1"
JVM_FLAGS=(-Xms128M -XX:MaxRAMPercentage=95.0)

ALLOWED_HOSTS=(
  cdn.modrinth.com
  edge.forgecdn.net
  mediafilez.forgecdn.net
  piston-meta.mojang.com
  piston-data.mojang.com
  meta.fabricmc.net
  maven.fabricmc.net
  meta.quiltmc.org
  maven.quiltmc.org
  maven.minecraftforge.net
  maven.neoforged.net
  api.papermc.io
  fill.papermc.io
  fill-data.papermc.io
  api.purpurmc.org
)

STEP=0
TOTAL=0

log() { echo "[astrelyse] $*"; }
step() {
  STEP=$((STEP + 1))
  log "$STEP/$TOTAL $*"
}
die() {
  echo "[astrelyse] ERROR: $*" >&2
  exit 1
}

# ---------------------------------------------------------------- guards

url_allowed() {
  local url=$1 host h
  [[ $url =~ ^https://([A-Za-z0-9.-]+)(/[^[:space:]\\#]*)?$ ]] || return 1
  host=${BASH_REMATCH[1],,}
  for h in "${ALLOWED_HOSTS[@]}"; do
    [[ $host == "$h" ]] && return 0
  done
  return 1
}

# A relative path with no empty, "." or ".." segments, no backslashes, no control characters.
safe_rel() {
  local p=$1 seg segs
  [[ -n $p && $p != /* && $p != *\\* && $p != *//* ]] || return 1
  [[ $p =~ [[:cntrl:]] ]] && return 1
  p=${p%/}
  [[ -n $p ]] || return 1
  IFS=/ read -r -a segs <<< "$p"
  for seg in "${segs[@]}"; do
    [[ -n $seg && $seg != . && $seg != .. ]] || return 1
  done
  return 0
}

# Prints the absolute path for a plan path after refusing anything that could leave /mnt/server.
# Second argument "read" allows paths inside .astrelyse (uploads); otherwise writes there are refused.
dest_path() {
  local rel=$1 mode=${2:-write} cur=$ROOT seg segs
  safe_rel "$rel" || die "Unsafe path in the plan: $rel"
  rel=${rel%/}
  if [[ $mode != read && ($rel == .astrelyse || $rel == .astrelyse/*) ]]; then
    die "The plan may not touch .astrelyse: $rel"
  fi
  IFS=/ read -r -a segs <<< "$rel"
  for seg in "${segs[@]}"; do
    cur="$cur/$seg"
    [[ ! -L $cur ]] || die "Refusing to follow a symlink: $rel"
  done
  printf '%s' "$ROOT/$rel"
}

download() {
  local url=$1 out=$2 effective
  url_allowed "$url" || die "Refusing to download from a host that is not allowed: $url"
  mkdir -p "$(dirname "$out")"
  effective=$(curl -fsSL --proto '=https' --proto-redir '=https' --max-redirs 5 --retry 3 --retry-delay 2 \
    --connect-timeout 20 --max-time 1800 -A "$UA" -o "$out" -w '%{url_effective}' "$url") || {
    rm -f "$out"
    die "Download failed: $url"
  }
  url_allowed "$effective" || {
    rm -f "$out"
    die "A download was redirected to a host that is not allowed: $effective"
  }
}

fetch() {
  download "$1" "$WORK/fetch.tmp"
  cat "$WORK/fetch.tmp"
  rm -f "$WORK/fetch.tmp"
}

verify() {
  local algo=$1 want=${2,,} file=$3 got
  got=$("${algo}sum" "$file" | cut -d' ' -f1)
  [[ $got == "$want" ]] || {
    rm -f "$file"
    die "$algo mismatch for $(basename "$file"): expected $want, got $got"
  }
}

# ---------------------------------------------------------------- tools

prepare_tools() {
  local missing=0 tool
  for tool in curl jq unzip sha1sum; do
    command -v "$tool" > /dev/null 2>&1 || missing=1
  done
  [[ -f /etc/ssl/certs/ca-certificates.crt ]] || missing=1
  if [[ $missing -eq 1 ]]; then
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq
    apt-get install -y -qq --no-install-recommends curl jq unzip ca-certificates > /dev/null
  fi
}

# ---------------------------------------------------------------- plan

HAVE_PLAN=0
OPERATION=install
WIPE=0
SW_TYPE=
SW_MC=
SW_LOADER=
RUN_SOFTWARE=1
WRITE_EULA=0
N_MOVES=0
N_REMOVE=0
N_FILES=0
N_ARCHIVES=0

load_plan() {
  [[ -e $PLAN || -L $PLAN ]] || return 0

  if [[ -L $PLAN || -L $ASTRELYSE_DIR ]]; then
    die "The install plan is a symlink."
  fi

  if [[ -z ${ASTRELYSE_PLAN_SHA256:-} ]]; then
    log "Ignoring a stale install plan: the panel did not set its hash."
    rm -f "$PLAN"
    return 0
  fi

  # Snapshot the plan first and check and read only the snapshot, so the file the hash covers is
  # the file that runs even if something rewrites plan.json while the install is going.
  rm -rf "$WORK"
  mkdir -p "$WORK"
  cp "$PLAN" "$WORK/plan.json"
  rm -f "$PLAN"
  PLAN="$WORK/plan.json"

  local actual
  actual=$(sha256sum "$PLAN" | cut -d' ' -f1)
  [[ $actual == "${ASTRELYSE_PLAN_SHA256,,}" ]] || die "The install plan does not match its hash. Refusing to run it."

  jq -e '.version == 1 and (.operation | IN("software","modpack","world","clear","mods"))' "$PLAN" > /dev/null \
    || die "The install plan is not a version 1 plan."

  HAVE_PLAN=1
  OPERATION=$(jq -r '.operation' "$PLAN")
  WIPE=$(jq -r 'if .wipe.enabled then 1 else 0 end' "$PLAN")
  WRITE_EULA=$(jq -r 'if .eula then 1 else 0 end' "$PLAN")
  N_MOVES=$(jq -r '(.moves // []) | length' "$PLAN")
  N_REMOVE=$(jq -r '(.remove // []) | length' "$PLAN")
  N_FILES=$(jq -r '(.files // []) | length' "$PLAN")
  N_ARCHIVES=$(jq -r '(.archives // []) | length' "$PLAN")

  if [[ $(jq -r '.software != null' "$PLAN") == true ]]; then
    SW_TYPE=$(jq -r '.software.type' "$PLAN")
    SW_MC=$(jq -r '.software.minecraft' "$PLAN")
    SW_LOADER=$(jq -r '.software.loader // ""' "$PLAN")
  elif [[ $OPERATION != clear ]]; then
    # Worlds, mods and a modpack without a software block change files only.
    RUN_SOFTWARE=0
  fi
}

# ---------------------------------------------------------------- steps

do_moves() {
  local i from to src dst
  step "Moving $N_MOVES item(s) aside..."
  for ((i = 0; i < N_MOVES; i++)); do
    from=$(jq -r ".moves[$i].from" "$PLAN")
    to=$(jq -r ".moves[$i].to" "$PLAN")
    src=$(dest_path "$from")
    dst=$(dest_path "$to")
    if [[ ! -e $src ]]; then
      log "  $from does not exist, skipping."
      continue
    fi
    [[ ! -e $dst ]] || die "Cannot move $from: $to already exists."
    mkdir -p "$(dirname "$dst")"
    mv -- "$src" "$dst"
  done
}

do_wipe() {
  local entry name keep k skip
  step "Wiping the server files (keeping your worlds and settings)..."
  mapfile -t keep < <(jq -r '.wipe.keep[]?' "$PLAN")
  for k in "${keep[@]:-}"; do
    [[ -z $k ]] || safe_rel "$k" || die "Unsafe keep entry in the plan: $k"
  done
  while IFS= read -r -d '' entry; do
    name=${entry##*/}
    [[ $name == .astrelyse ]] && continue
    skip=0
    for k in "${keep[@]:-}"; do
      # A nested keep entry keeps its whole top-level folder.
      [[ -n $k && ${k%%/*} == "$name" ]] && skip=1
    done
    [[ $skip -eq 1 ]] && continue
    rm -rf --one-file-system -- "$entry"
  done < <(find "$ROOT" -mindepth 1 -maxdepth 1 -print0)
}

do_remove() {
  local i rel path
  step "Removing $N_REMOVE old item(s)..."
  for ((i = 0; i < N_REMOVE; i++)); do
    rel=$(jq -r ".remove[$i]" "$PLAN")
    path=$(dest_path "$rel")
    rm -rf --one-file-system -- "$path"
  done
}

# Resolves "latest" and checks the shape of the version strings that end up in URLs.
resolve_minecraft() {
  local mc=$1
  if [[ -z $mc || $mc == latest ]]; then
    mc=$(fetch "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json" | jq -r '.latest.release')
  fi
  [[ $mc =~ ^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$ ]] || die "Invalid Minecraft version: $mc"
  printf '%s' "$mc"
}

check_loader() {
  [[ -z $1 || $1 =~ ^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$ ]] || die "Invalid loader version: $1"
}

JAR_FILE=server.jar
START_KIND=jar   # jar | args
START_TARGET=server.jar

install_vanilla() {
  local mc=$1 manifest version_url version_json url sha
  manifest=$(fetch "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json")
  version_url=$(jq -r --arg v "$mc" '.versions[] | select(.id == $v) | .url' <<< "$manifest" | head -n1)
  [[ -n $version_url ]] || die "Minecraft $mc was not found in the Mojang version manifest."
  version_json=$(fetch "$version_url")
  url=$(jq -r '.downloads.server.url // empty' <<< "$version_json")
  sha=$(jq -r '.downloads.server.sha1 // empty' <<< "$version_json")
  [[ -n $url && -n $sha ]] || die "Minecraft $mc has no server download."
  download "$url" "$ROOT/$JAR_FILE"
  verify sha1 "$sha" "$ROOT/$JAR_FILE"
}

install_paper() {
  local project=$1 mc=$2 wanted=${3:-latest} build url sha
  [[ $wanted == latest || $wanted =~ ^[0-9]+$ ]] || die "Invalid $project build: $wanted"
  build=$(fetch "https://fill.papermc.io/v3/projects/$project/versions/$mc/builds/$wanted") || die "$project does not have a build for $mc."
  url=$(jq -r '.downloads["server:default"].url // empty' <<< "$build")
  sha=$(jq -r '.downloads["server:default"].checksums.sha256 // empty' <<< "$build")
  [[ -n $url && -n $sha ]] || die "$project has no server download for $mc."
  log "  $project build $(jq -r '.id' <<< "$build") ($(jq -r '.channel' <<< "$build"))"
  download "$url" "$ROOT/$JAR_FILE"
  verify sha256 "$sha" "$ROOT/$JAR_FILE"
}

install_purpur() {
  local mc=$1 wanted=${2:-} info build md5
  info=$(fetch "https://api.purpurmc.org/v2/purpur/$mc") || die "Purpur does not support $mc."
  build=${wanted:-$(jq -r '.builds.latest // empty' <<< "$info")}
  [[ $build =~ ^[0-9]+$ ]] || die "Purpur has no build for $mc."
  md5=$(fetch "https://api.purpurmc.org/v2/purpur/$mc/$build" | jq -r '.md5 // empty')
  log "  Purpur build $build"
  download "https://api.purpurmc.org/v2/purpur/$mc/$build/download" "$ROOT/$JAR_FILE"
  [[ -z $md5 ]] || verify md5 "$md5" "$ROOT/$JAR_FILE"
}

install_fabric() {
  local mc=$1 loader=$2 installer
  installer=$(fetch "https://meta.fabricmc.net/v2/versions/installer" | jq -r '[.[] | select(.stable)][0].version // .[0].version')
  if [[ -z $loader ]]; then
    loader=$(fetch "https://meta.fabricmc.net/v2/versions/loader/$mc" | jq -r '[.[] | select(.loader.stable)][0].loader.version // empty')
    [[ -n $loader ]] || die "Fabric does not support Minecraft $mc."
  fi
  check_loader "$loader"
  [[ $installer =~ ^[0-9][0-9.]*$ ]] || die "Unexpected Fabric installer version: $installer"
  log "  Fabric loader $loader, installer $installer"
  download "https://meta.fabricmc.net/v2/versions/loader/$mc/$loader/$installer/server/jar" "$ROOT/$JAR_FILE"
  # The meta service publishes no hash for this generated launcher, so only its type is checked.
  unzip -tq "$ROOT/$JAR_FILE" > /dev/null || die "The Fabric launcher jar is not a valid jar."
}

install_quilt() {
  local mc=$1 loader=$2 installers url sha
  installers=$(fetch "https://meta.quiltmc.org/v3/versions/installer")
  url=$(jq -r '.[0].url // empty' <<< "$installers")
  sha=$(jq -r '.[0].hashes.sha256 // empty' <<< "$installers")
  [[ -n $url && -n $sha ]] || die "Could not find the Quilt installer."
  if [[ -z $loader ]]; then
    loader=$(fetch "https://meta.quiltmc.org/v3/versions/loader/$mc" | jq -r '([.[] | select(.loader.version | contains("-") | not)][0] // .[0]).loader.version // empty')
    [[ -n $loader ]] || die "Quilt does not support Minecraft $mc."
  fi
  check_loader "$loader"
  log "  Quilt loader $loader"
  download "$url" "$WORK/quilt-installer.jar"
  verify sha256 "$sha" "$WORK/quilt-installer.jar"
  (cd "$ROOT" && java -jar "$WORK/quilt-installer.jar" install server "$mc" "$loader" --download-server --install-dir="$ROOT") \
    > "$WORK/installer.log" 2>&1 || {
    tail -n 40 "$WORK/installer.log"
    die "The Quilt installer failed."
  }
  [[ -f $ROOT/quilt-server-launch.jar ]] || die "The Quilt installer did not create quilt-server-launch.jar."
  START_TARGET=quilt-server-launch.jar
}

# Finds the loader version of the newest Maven release for Minecraft $2 in a maven-metadata.xml.
maven_versions() {
  fetch "$1" | sed -n 's|.*<version>\(.*\)</version>.*|\1|p'
}

run_forge_style_installer() {
  local installer=$1 label=$2
  (cd "$ROOT" && java -jar "$installer" --installServer) > "$WORK/installer.log" 2>&1 || {
    tail -n 40 "$WORK/installer.log"
    die "The $label installer failed."
  }
}

install_forge() {
  local mc=$1 loader=$2 full url args jar
  if [[ -z $loader ]]; then
    loader=$(maven_versions "https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml" \
      | grep -F -- "${mc}-" | grep -E "^${mc//./\\.}-[0-9]" | tail -n1 | sed "s/^${mc//./\\.}-//" || true)
    [[ -n $loader ]] || die "Forge does not support Minecraft $mc."
  fi
  check_loader "$loader"
  full="$mc-$loader"
  log "  Forge $full"
  url="https://maven.minecraftforge.net/net/minecraftforge/forge/$full/forge-$full-installer.jar"
  download "$url" "$WORK/forge-installer.jar"
  verify sha1 "$(fetch "$url.sha1" | tr -d '[:space:]')" "$WORK/forge-installer.jar"
  run_forge_style_installer "$WORK/forge-installer.jar" Forge
  args="libraries/net/minecraftforge/forge/$full/unix_args.txt"
  if [[ -f $ROOT/$args ]]; then
    START_KIND=args
    START_TARGET=$args
  else
    for jar in "forge-$full.jar" "forge-$full-universal.jar" "forge-$full-server.jar"; do
      if [[ -f $ROOT/$jar ]]; then
        START_TARGET=$jar
        break
      fi
    done
    [[ $START_TARGET != "$JAR_FILE" || -f $ROOT/$JAR_FILE ]] || die "The Forge installer did not create a server jar."
  fi
}

install_neoforge() {
  local mc=$1 loader=$2 prefix minor patch parts url args
  if [[ -z $loader ]]; then
    IFS=. read -r -a parts <<< "$mc"
    if [[ ${parts[0]} == 1 ]]; then
      minor=${parts[1]:-0}
      patch=${parts[2]:-0}
      prefix="$minor.$patch."
    else
      prefix="$mc."
    fi
    loader=$(maven_versions "https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml" \
      | grep -E -- "^${prefix//./\\.}" | grep -v -- '-' | tail -n1 || true)
    if [[ -z $loader ]]; then
      loader=$(maven_versions "https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml" | grep -E -- "^${prefix//./\\.}" | tail -n1 || true)
    fi
    [[ -n $loader ]] || die "NeoForge does not support Minecraft $mc."
  fi
  check_loader "$loader"
  log "  NeoForge $loader"
  url="https://maven.neoforged.net/releases/net/neoforged/neoforge/$loader/neoforge-$loader-installer.jar"
  download "$url" "$WORK/neoforge-installer.jar"
  verify sha1 "$(fetch "$url.sha1" | tr -d '[:space:]')" "$WORK/neoforge-installer.jar"
  run_forge_style_installer "$WORK/neoforge-installer.jar" NeoForge
  args="libraries/net/neoforged/neoforge/$loader/unix_args.txt"
  [[ -f $ROOT/$args ]] || die "The NeoForge installer did not create $args."
  START_KIND=args
  START_TARGET=$args
}

write_start_script() {
  local flags="${JVM_FLAGS[*]}"
  if [[ $START_KIND == args ]]; then
    [[ -f $ROOT/user_jvm_args.txt ]] || printf '%s\n' "${JVM_FLAGS[@]}" > "$ROOT/user_jvm_args.txt"
    printf '#!/bin/bash\n# Written by the Astrelyse installer. Add JVM flags to user_jvm_args.txt.\nexec java @user_jvm_args.txt @%s nogui "$@"\n' "$START_TARGET" > "$ROOT/start.sh"
  else
    printf '#!/bin/bash\n# Written by the Astrelyse installer.\nexec java %s -jar %s nogui "$@"\n' "$flags" "$START_TARGET" > "$ROOT/start.sh"
  fi
  chmod 755 "$ROOT/start.sh"
}

do_software() {
  local type mc loader
  if [[ $HAVE_PLAN -eq 1 && -n $SW_TYPE ]]; then
    type=$SW_TYPE
    mc=$SW_MC
    loader=$SW_LOADER
  else
    type=${SERVER_TYPE:-vanilla}
    mc=${MC_VERSION:-latest}
    loader=${LOADER_VERSION:-}
  fi
  JAR_FILE=${SERVER_JARFILE:-server.jar}
  [[ $JAR_FILE =~ ^[A-Za-z0-9._-]+\.jar$ ]] || die "Invalid SERVER_JARFILE: $JAR_FILE"
  START_TARGET=$JAR_FILE

  mc=$(resolve_minecraft "$mc")
  check_loader "$loader"
  step "Installing $type for Minecraft $mc..."

  case $type in
    vanilla) install_vanilla "$mc" ;;
    paper | folia) install_paper "$type" "$mc" "${loader:-latest}" ;;
    purpur) install_purpur "$mc" "$loader" ;;
    fabric) install_fabric "$mc" "$loader" ;;
    quilt) install_quilt "$mc" "$loader" ;;
    forge) install_forge "$mc" "$loader" ;;
    neoforge) install_neoforge "$mc" "$loader" ;;
    *) die "Unknown server type: $type" ;;
  esac

  write_start_script
}

do_files() {
  local i rel url sha1 sha512 dest tmp
  step "Downloading $N_FILES file(s)..."
  for ((i = 0; i < N_FILES; i++)); do
    rel=$(jq -r ".files[$i].path" "$PLAN")
    url=$(jq -r ".files[$i].url" "$PLAN")
    sha1=$(jq -r ".files[$i].sha1 // \"\"" "$PLAN")
    sha512=$(jq -r ".files[$i].sha512 // \"\"" "$PLAN")
    dest=$(dest_path "$rel")
    [[ -n $sha1 || -n $sha512 ]] || die "No hash for $rel in the plan."
    tmp="$WORK/file.$i"
    download "$url" "$tmp"
    if [[ -n $sha512 ]]; then
      verify sha512 "$sha512" "$tmp"
    else
      verify sha1 "$sha1" "$tmp"
    fi
    mkdir -p "$(dirname "$dest")"
    [[ ! -d $dest ]] || die "Cannot replace the folder $rel with a file."
    mv -f -- "$tmp" "$dest"
    if (((i + 1) % 25 == 0)) || ((i + 1 == N_FILES)); then
      log "  $((i + 1))/$N_FILES files done"
    fi
  done
}

do_archives() {
  local i url local_path sha1 strip into only archive extract src dest name stripped
  step "Unpacking $N_ARCHIVES archive(s)..."
  for ((i = 0; i < N_ARCHIVES; i++)); do
    url=$(jq -r ".archives[$i].url // \"\"" "$PLAN")
    local_path=$(jq -r ".archives[$i].local // \"\"" "$PLAN")
    sha1=$(jq -r ".archives[$i].sha1 // \"\"" "$PLAN")
    strip=$(jq -r ".archives[$i].strip // \"\"" "$PLAN")
    into=$(jq -r ".archives[$i].into // \"\"" "$PLAN")
    only=$(jq -r ".archives[$i].only // \"\"" "$PLAN")

    if [[ -n $url ]]; then
      [[ -n $sha1 ]] || die "Archive $i has no sha1."
      archive="$WORK/archive.$i.zip"
      download "$url" "$archive"
    else
      archive=$(dest_path "$local_path" read)
      [[ -f $archive ]] || die "The uploaded archive $local_path does not exist."
    fi
    [[ -z $sha1 ]] || verify sha1 "$sha1" "$archive"
    [[ -n $strip ]] && strip=${strip%/}
    [[ -n $only ]] && only=${only%/}

    # Check every entry name before anything is extracted.
    while IFS= read -r name; do
      [[ -n $name ]] || continue
      safe_rel "$name" || die "The archive contains an unsafe path: $name"
    done < <(unzip -Z1 "$archive")

    extract="$WORK/extract.$i"
    rm -rf "$extract"
    mkdir -p "$extract"
    unzip -q -o "$archive" -d "$extract" || die "Could not unpack the archive."
    [[ -z $(find "$extract" -type l -print -quit) ]] || die "The archive contains symlinks, which are not allowed."

    src=$extract
    stripped=""
    if [[ -n $strip ]]; then
      safe_rel "$strip" || die "Unsafe strip path in the plan: $strip"
      stripped="$strip"
    fi
    if [[ -n $only ]]; then
      safe_rel "$only" || die "Unsafe only path in the plan: $only"
      # The panel sends only == strip ("take overrides/ and drop that prefix"), or an `only` that
      # already includes the stripped prefix; join them only when `only` is relative to it.
      if [[ -n $stripped && ($only == "$stripped" || $only == "$stripped"/*) ]]; then
        stripped="$only"
      else
        stripped="${stripped:+$stripped/}$only"
      fi
    fi
    [[ -z $stripped ]] || src="$extract/$stripped"
    if [[ ! -d $src ]]; then
      die "The archive has no ${stripped:-root} folder."
    fi

    if [[ -n $into ]]; then
      dest=$(dest_path "$into")
    else
      dest=$ROOT
    fi
    [[ ! -L $dest ]] || die "Refusing to follow a symlink: $into"
    mkdir -p "$dest"
    rm -rf "$src/.astrelyse"
    cp -a "$src/." "$dest/"
    rm -rf "$extract"
    [[ -n $url ]] && rm -f "$archive"
  done
  return 0
}

# ---------------------------------------------------------------- main

mkdir -p "$ROOT" "$WORK"
cd "$ROOT"

if [[ -L $ASTRELYSE_DIR ]]; then
  die ".astrelyse is a symlink."
fi

prepare_tools
load_plan

TOTAL=1
[[ $N_MOVES -gt 0 ]] && TOTAL=$((TOTAL + 1))
[[ $WIPE -eq 1 ]] && TOTAL=$((TOTAL + 1))
[[ $N_REMOVE -gt 0 ]] && TOTAL=$((TOTAL + 1))
[[ $RUN_SOFTWARE -eq 1 ]] && TOTAL=$((TOTAL + 1))
[[ $N_FILES -gt 0 ]] && TOTAL=$((TOTAL + 1))
[[ $N_ARCHIVES -gt 0 ]] && TOTAL=$((TOTAL + 1))

if [[ $HAVE_PLAN -eq 1 ]]; then
  step "Plan verified ($OPERATION)."
else
  step "No install plan, installing from the server variables."
fi

[[ $N_MOVES -gt 0 ]] && do_moves
[[ $WIPE -eq 1 ]] && do_wipe
[[ $N_REMOVE -gt 0 ]] && do_remove
[[ $RUN_SOFTWARE -eq 1 ]] && do_software
[[ $N_FILES -gt 0 ]] && do_files
[[ $N_ARCHIVES -gt 0 ]] && do_archives

if [[ $WRITE_EULA -eq 1 ]]; then
  printf 'eula=true\n' > "$ROOT/eula.txt"
fi

rm -rf "$WORK"
rm -f "$PLAN"
log "Install complete."
exit 0
