#!/usr/bin/env bash
# S14.2: one backup run (architecture §10, D36). The nightly workflow (.github/workflows/backup.yml)
# runs it; it also runs by hand against any database and any two rclone remotes.
#
# 1. mongodump of the database, gzipped and encrypted with age to the owner's public key, then
#    uploaded as mongo/<database>-<UTC time>.archive.gz.age. Nothing unencrypted touches the disk.
#    Sessions are left out (see below).
#    The bucket's lifecycle deletes these after 30 days.
# 2. rclone sync of the photo bucket into photos/current. A photo gone from the source (replaced or
#    deleted) moves to photos/replaced/<UTC time>/, which the lifecycle also deletes after 30 days.
#
# Inputs (environment):
#   MONGODB_URI      a read-only user's connection string; never printed
#   MONGODB_DB       the database to dump
#   AGE_RECIPIENT    the age public key (age1…) the dump is encrypted to
#   BACKUP_DEST      rclone path for backups, e.g. backup:toe-beans-backups
#   PHOTOS_SOURCE    rclone path of the photos, e.g. photos:toe-beans-photos
#   MAX_PHOTO_MOVES  optional (default 50): stop rather than move more photos out of
#                    photos/current in one run, in case the source has been emptied by mistake
# The remotes are defined by RCLONE_CONFIG_<NAME>_* variables (see the workflow), so no rclone
# config file is written.
set -euo pipefail

for name in MONGODB_URI MONGODB_DB AGE_RECIPIENT BACKUP_DEST PHOTOS_SOURCE; do
	[ -n "${!name:-}" ] || { echo "Set $name" >&2; exit 2; }
done
[[ $AGE_RECIPIENT == age1* ]] || { echo "AGE_RECIPIENT isn't an age public key (age1…)" >&2; exit 2; }

stamp=$(date -u +%Y-%m-%dT%H%M%SZ)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
dump="$work/$MONGODB_DB-$stamp.archive.gz.age"

echo "== Database"
# Written to a file first, so a dump that fails half way never reaches the bucket as if whole.
# Sign-in sessions and sign-ins in progress are left out: they last hours to days, and a restore
# signing everyone out is safer than one bringing old sessions back.
# Its messages go to the workflow's public log: progress lines (which count documents, so users
# and households) are dropped, and credentials in a quoted URI are blanked.
mongodump --uri="$MONGODB_URI" --db="$MONGODB_DB" --archive --gzip \
	--excludeCollection=sessions --excludeCollection=pendingSignIns \
	2> >(sed -E '/\t(writing|done dumping) /d; s#//[^@/]*@#//***@#g' >&2) |
	age -r "$AGE_RECIPIENT" >"$dump"
size=$(stat -c %s "$dump")
# An empty database still makes a few hundred bytes; a few KB is the least a real one makes.
[ "$size" -ge 1024 ] || { echo "The dump is only $size bytes; not uploading it" >&2; exit 1; }
head -c 21 "$dump" | grep -q '^age-encryption.org/v1' || { echo "The dump isn't age-encrypted" >&2; exit 1; }
rclone copyto "$dump" "$BACKUP_DEST/mongo/${dump##*/}"
echo "Uploaded mongo/${dump##*/}"

echo "== Photos"
# --checksum: R2's ETag is the MD5 for these single-part objects, and photo keys never change, so
# only new photos are copied. --max-delete counts the moves into photos/replaced. Not verbose: the
# workflow's log is public, so it names no objects and counts nothing.
rclone sync "$PHOTOS_SOURCE" "$BACKUP_DEST/photos/current" \
	--backup-dir "$BACKUP_DEST/photos/replaced/$stamp" \
	--checksum --max-delete "${MAX_PHOTO_MOVES:-50}"
echo "Photos in sync"
