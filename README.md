# media-server

A self-hosted media library for a personal video collection, built around one
idea: **your filesystem is the source of truth, and no metadata ever comes from
the internet.**

It scans folders you point it at, works out performers, studios, release dates
and titles from how the files are named and filed, and gives you a browsable
library over the top. Nothing is looked up externally, nothing is uploaded, and
the files themselves are opened read-only.

## Why not Jellyfin

Jellyfin is excellent at what it does. This exists because of three things it
does differently:

- **Libraries are type-locked.** A library is "Movies" or "TV" or "Photos", and
  content can't mix. Here there is one library with a polymorphic `media_items`
  table, so videos, photos and folders coexist and grouping is user-driven.
- **Naming conventions are rigid, and getting them wrong means no metadata.**
  Here the conventions are yours: the scanner reads what it can, never fails a
  file, and never blocks on identifying anything.
- **Organising means fighting the scraper.** With no external source there is
  nothing to fight. The scanner owns a field until you edit it, then it stops
  touching it — permanently.

## What it does

- **Scans** a set of folders you choose, on demand or on an interval
- **Derives** performers, studios, release dates and titles from paths and
  filenames — see [Naming](#naming) below
- **Streams** with HTTP range support, so seeking works
- **Generates** poster frames and multi-segment hover previews with ffmpeg
- **Organises** with tags, favourites, categories, manual and rule-based
  collections, and virtual folders
- **Tracks** watch progress, play counts and a watched state
- **Backs up** the database and your uploaded artwork to a single archive
- **Survives reorganisation**: files are matched by content hash, so moving or
  renaming one keeps its tags, framing and watch history

## Stack

| Layer | Choice |
|---|---|
| Server | Node 22, TypeScript, Fastify |
| Database | PostgreSQL 17, Drizzle ORM |
| Frontend | React 19, Vite, TanStack Router/Query, Tailwind 4 |
| Media | ffmpeg/ffprobe (probing, posters, previews), sharp (images) |
| Deployment | Docker Compose |

The REST API is documented at `/api/docs` (Swagger UI), and is deliberately a
plain HTTP API rather than a TypeScript-only RPC layer, so other clients can
be written against it.

## Running it

Requires Docker and Docker Compose.

```bash
git clone git@github.com:doodlesvee/media-server.git
cd media-server
cp .env.example docker/.env      # then edit it — see below
docker compose -f docker/docker-compose.yml up --build
```

Open <http://localhost:3000>. The first screen creates your account; there is
no default login.

### Configuration

`docker/.env` is gitignored and holds the machine-specific paths:

| Variable | Meaning | Default |
|---|---|---|
| `MEDIA_ROOT` | Your library, mounted **read-only** | `./media-placeholder` |
| `HOME_ROOT` | What the in-app folder browser may look at, read-only | `/Users` |
| `BACKUP_DIR` | The one writable mount, where backups are written | `../backups` |

Everything else — which folders to scan, scan interval, categories, hero
picks — is configured in the app under **Site settings**, not in env vars.

### Development

Runs the server and Vite in containers with the source bind-mounted:

```bash
npm run dev:docker
```

The web app is then on <http://localhost:5173>, proxying `/api` to the server.

> **On macOS, bind-mounted file changes do not raise inotify events inside the
> container.** `tsx watch` and Vite HMR will not see your edits. Restart the
> affected container after changing server code:
> `docker compose -f docker/docker-compose.yml restart app`.
> This is also why scanning is interval-based rather than using a file watcher.

Migrations are generated with `npm run db:generate -w apps/server` and applied
automatically on boot.

## Naming

The scanner reads two things: **where a file is** and **what it's called**.
Neither is mandatory — a file with an unhelpful name still imports, plays and
can be organised by hand.

### Folders

```
<library root>/<Performer>/<Studio>/file.mp4
                    │          └── optional: sets the studio for everything inside
                    └── the performer whose collection this is
```

Images in a folder are treated as a **gallery belonging to the video beside
them**, not as separate library items — so a scene and its stills stay
together.

### Filenames

The declared convention, opted into by a **leading `[`**:

```
[Studio] Performer 1, Performer 2 - MM.DD.YYYY - Video title.mp4
```

Everything in it is optional except the studio bracket. A filename that
doesn't start with `[` is read the older, looser way: the folder names the
performer, and a `[Bracket]` anywhere supplies the studio.

Because you typed the brackets and commas deliberately, names inside them are
trusted literally — which is what makes it safe to create performers from a
filename without guessing. It also means **a video with two performers needs
only one file**; listing both credits it to both.

Release dates are read as `MM.DD.YYYY` or `YYYY.MM.DD`, told apart by which end
carries the four-digit year. Two-digit years are ignored rather than guessed at.

Where two sources disagree, the more deliberate one wins:

1. what you edited by hand in the app — permanently
2. a leading `[Studio]` in that specific file's name
3. the `<Studio>/` folder
4. a `[Bracket]` elsewhere in the filename

## Backups

**Back up now** in Site settings writes a single `.tar.gz` containing a full
`pg_dump` and every image you've uploaded. Posters, previews and generated
thumbnails are deliberately excluded — they're regenerable from your videos,
and including them would take a backup from a few MB to tens of GB, which in
practice means it stops being run.

Restoring is a script rather than a button, because the server applies
migrations at startup and has to be stopped while its database is replaced:

```bash
scripts/restore.sh backups/media-server-<timestamp>.tar.gz --yes
```

A backup only protects you if it leaves the machine — point `BACKUP_DIR` at an
external drive or a synced folder.

## Formats

Scanned: `mp4` `mkv` `avi` `mov` `webm` `m4v` `f4v` `wmv`, and `jpg` `jpeg`
`png` `gif` `webp` `heic`.

Everything scannable gets a poster and a hover preview, because ffmpeg reads
far more than a browser plays. **Playback is direct-play only** — there is no
transcoding. Where a file's container or codec won't play in a browser (an
H.264 MKV, say, or VC-1 in WMV), the detail view says so and names which of the
two is the problem, since a container needs only a fast remux while a codec
needs a full re-encode.

## Status

Built for one person's library and used daily against it. There is no
multi-user support, no transcoding, and no mobile app. The API is stable enough
to build against but not versioned.
