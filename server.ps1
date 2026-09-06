# TableX local server - static files + ONE write route for database updates
# Usage: .\server.ps1 [-NoLaunch] [-Port 8094]
#
# TableX is a client-side app; the server exists to give it an http:// origin (it
# fetch()es data/*.json at startup, which file:// blocks) and to persist a database
# update to disk so it sticks for everyone using this copy, not just one browser.
# Same shape as UbiPlus's server.ps1, minus the whole TCP/unit layer that app has.
#
# Routes:
#   POST   api/db/<idf|cellcom|partner|pelephone> -> writes TableX/data/<network>.json
#   GET    api/tpl                -> lists the deck templates (metadata only)
#   POST   api/tpl/<id>           -> writes TableX/data/tpl/<id>.json + <id>.pptx
#   DELETE api/tpl/<id>           -> removes both
#   everything else               -> static file under TableX/
#
# A template is stored as TWO files on purpose: the small .json (name, slide
# order, slot rectangles) so the list loads without touching megabytes, and the
# .pptx itself, written as REAL BYTES rather than base64. That keeps the stored
# template a file anyone can just open in PowerPoint, and lets the app fetch it
# over the ordinary static route when it finally needs it.
param(
    [switch]$NoLaunch,
    [int]$Port = 8094          # UbiPlus owns 8093; keep both runnable side by side
)

$ErrorActionPreference = 'Stop'

# Web root is TableX/, not the repo root - so nothing beside it (.git, tools/, any
# Planet workbook dropped here to convert) is ever reachable over HTTP.
$root   = Join-Path $PSScriptRoot 'TableX'
$prefix = "http://localhost:$Port/"

if (-not (Test-Path $root)) {
    Write-Host "TableX folder not found at $root" -ForegroundColor Red
    exit 1
}

# The only names the write route will accept. A whitelist, not sanitisation -
# there is no way to phrase a request that writes outside TableX\data.
$NETWORKS = @('idf', 'cellcom', 'partner', 'pelephone')

# Template ids cannot be whitelisted the way network names are - the user
# creates them - so they are constrained instead: lowercase, digits and dashes
# only, which contains no '.' and no separator and therefore cannot name a path
# outside data\tpl. Matched with -cmatch for the same reason the db route uses
# it (see the comment there); with -match, "A" would pass a [a-z] class.
$TPL_ID = '^[a-z0-9][a-z0-9-]{0,39}$'

function Write-Bytes {
    param($Response, [byte[]]$Bytes, [string]$ContentType)
    $Response.ContentType = $ContentType
    $Response.ContentLength64 = $Bytes.Length
    $Response.OutputStream.Write($Bytes, 0, $Bytes.Length)
}

$listener = New-Object Net.HttpListener
$listener.Prefixes.Add($prefix)
try {
    $listener.Start()
} catch {
    # HttpListener is disposed after a failed Start() - recreate and retry once.
    Write-Host "Port $Port busy, retrying in 2s..." -ForegroundColor Yellow
    Start-Sleep -Seconds 2
    $listener = New-Object Net.HttpListener
    $listener.Prefixes.Add($prefix)
    $listener.Start()
}

Write-Host "TableX server running at $prefix" -ForegroundColor Green
Write-Host "Serving  $root" -ForegroundColor DarkGray
Write-Host "Ctrl+C to stop." -ForegroundColor DarkGray

if (-not $NoLaunch) { Start-Process $prefix }

while ($listener.IsListening) {
    $ctx  = $listener.GetContext()
    $req  = $ctx.Request
    $res  = $ctx.Response
    $path = [Uri]::UnescapeDataString($req.Url.AbsolutePath).TrimStart('/')

    try {
        # ---------- database update ----------
        # The ONLY write route. The network name is whitelisted rather than
        # sanitised, so no request can steer the write outside data/.
        #
        # -cmatch / -ccontains, NOT -match / -contains: PowerShell's comparison
        # operators are case-INSENSITIVE by default, so `[a-z]+` happily matched
        # "Partner" and the whitelist accepted it -- which on Windows' case-
        # insensitive filesystem wrote Partner.json straight over partner.json.
        # Caught by a probe on 2026-09-04; the .bak below is what saved the DB.
        if ($req.HttpMethod -eq 'POST' -and $path -cmatch '^api/db/([a-z]+)$') {
            $net = $Matches[1]
            if ($NETWORKS -cnotcontains $net) {
                $res.StatusCode = 404
                Write-Bytes $res ([Text.Encoding]::UTF8.GetBytes("unknown network: $net")) 'text/plain; charset=utf-8'
            } else {
                $reader = New-Object IO.StreamReader($req.InputStream, [Text.Encoding]::UTF8)
                $body = $reader.ReadToEnd()
                $reader.Close()

                if ([string]::IsNullOrWhiteSpace($body)) {
                    $res.StatusCode = 400
                    Write-Bytes $res ([Text.Encoding]::UTF8.GetBytes('empty body')) 'text/plain; charset=utf-8'
                } else {
                    $dataDir = Join-Path $root 'data'
                    if (-not (Test-Path $dataDir)) { New-Item -ItemType Directory -Path $dataDir | Out-Null }
                    $dest = Join-Path $dataDir "$net.json"

                    # Keep one rollback copy - an operator replacing 14k sectors
                    # with the wrong workbook should not be a one-way door.
                    if (Test-Path $dest) { Copy-Item $dest "$dest.bak" -Force }

                    # UTF8Encoding($false) = no BOM. PS 5.1's Set-Content/Out-File
                    # would add one, and JSON.parse chokes on a leading BOM.
                    [IO.File]::WriteAllText($dest, $body, (New-Object Text.UTF8Encoding($false)))

                    $kb = [math]::Round((Get-Item $dest).Length / 1KB, 1)
                    Write-Host ("  updated data/{0}.json ({1} KB)" -f $net, $kb) -ForegroundColor Green
                    $res.StatusCode = 200
                    Write-Bytes $res ([Text.Encoding]::UTF8.GetBytes("{`"ok`":true,`"bytes`":$((Get-Item $dest).Length)}")) 'application/json; charset=utf-8'
                }
            }
        }
        # ---------- deck templates ----------
        # Same shape as the database route: constrain the name first, write
        # under data\ only, and never let a request steer the path.
        elseif ($path -ceq 'api/tpl' -and $req.HttpMethod -eq 'GET') {
            $tplDir = Join-Path (Join-Path $root 'data') 'tpl'
            $items = @()
            if (Test-Path $tplDir) {
                foreach ($f in (Get-ChildItem -Path $tplDir -Filter '*.json' | Sort-Object Name)) {
                    $items += [IO.File]::ReadAllText($f.FullName, [Text.Encoding]::UTF8)
                }
            }
            # Concatenated rather than re-serialised: each file is already the
            # JSON the app wrote, and round-tripping it through PowerShell is
            # how Hebrew names would get mangled.
            $json = '[' + ($items -join ',') + ']'
            $res.StatusCode = 200
            Write-Bytes $res ([Text.Encoding]::UTF8.GetBytes($json)) 'application/json; charset=utf-8'
        }
        # The deck rides its OWN route as raw bytes rather than base64 inside a
        # JSON envelope. PS 5.1's ConvertFrom-Json is backed by
        # JavaScriptSerializer and throws on a long string, which a multi-MB
        # deck comfortably is; raw bytes also skip base64's 33% inflation.
        elseif ($path -cmatch '^api/tpl/([a-z0-9-]+)/deck$' -and $req.HttpMethod -eq 'POST') {
            $id = $Matches[1]
            if ($id -cnotmatch $TPL_ID) {
                $res.StatusCode = 400
                Write-Bytes $res ([Text.Encoding]::UTF8.GetBytes('bad template id')) 'text/plain; charset=utf-8'
            } else {
                $tplDir = Join-Path (Join-Path $root 'data') 'tpl'
                if (-not (Test-Path $tplDir)) { New-Item -ItemType Directory -Path $tplDir -Force | Out-Null }
                $ms = New-Object IO.MemoryStream
                $req.InputStream.CopyTo($ms)
                $bytes = $ms.ToArray()
                $ms.Dispose()
                # "PK" - if it is not a zip it is not a pptx, and storing it
                # would only fail later, further from the cause.
                if ($bytes.Length -lt 4 -or $bytes[0] -ne 0x50 -or $bytes[1] -ne 0x4B) {
                    $res.StatusCode = 400
                    Write-Bytes $res ([Text.Encoding]::UTF8.GetBytes('not a pptx')) 'text/plain; charset=utf-8'
                } else {
                    [IO.File]::WriteAllBytes((Join-Path $tplDir "$id.pptx"), $bytes)
                    Write-Host ("  stored deck {0} ({1} KB)" -f $id, [math]::Round($bytes.Length / 1KB, 1)) -ForegroundColor Green
                    $res.StatusCode = 200
                    Write-Bytes $res ([Text.Encoding]::UTF8.GetBytes('{"ok":true}')) 'application/json; charset=utf-8'
                }
            }
        }
        elseif ($path -cmatch '^api/tpl/([a-z0-9-]+)$' -and
                ($req.HttpMethod -eq 'POST' -or $req.HttpMethod -eq 'DELETE')) {
            $id = $Matches[1]
            if ($id -cnotmatch $TPL_ID) {
                $res.StatusCode = 400
                Write-Bytes $res ([Text.Encoding]::UTF8.GetBytes('bad template id')) 'text/plain; charset=utf-8'
            } else {
                $tplDir = Join-Path (Join-Path $root 'data') 'tpl'
                if (-not (Test-Path $tplDir)) { New-Item -ItemType Directory -Path $tplDir -Force | Out-Null }
                $metaPath = Join-Path $tplDir "$id.json"
                $deckPath = Join-Path $tplDir "$id.pptx"

                if ($req.HttpMethod -eq 'DELETE') {
                    if (Test-Path $metaPath) { Remove-Item $metaPath -Force }
                    if (Test-Path $deckPath) { Remove-Item $deckPath -Force }
                    Write-Host ("  removed template {0}" -f $id) -ForegroundColor Yellow
                    $res.StatusCode = 200
                    Write-Bytes $res ([Text.Encoding]::UTF8.GetBytes('{"ok":true}')) 'application/json; charset=utf-8'
                } else {
                    $reader = New-Object IO.StreamReader($req.InputStream, [Text.Encoding]::UTF8)
                    $body = $reader.ReadToEnd()
                    $reader.Close()
                    if ([string]::IsNullOrWhiteSpace($body)) {
                        $res.StatusCode = 400
                        Write-Bytes $res ([Text.Encoding]::UTF8.GetBytes('empty body')) 'text/plain; charset=utf-8'
                    } elseif (-not (Test-Path $deckPath)) {
                        # Metadata without a deck is an orphan the list would
                        # render as a template that cannot be opened.
                        $res.StatusCode = 400
                        Write-Bytes $res ([Text.Encoding]::UTF8.GetBytes('no deck stored for this id')) 'text/plain; charset=utf-8'
                    } else {
                        # Written verbatim, exactly like the database route: it
                        # is already the JSON the app built, Hebrew name and all,
                        # and round-tripping it through PowerShell is how that
                        # name would get mangled.
                        [IO.File]::WriteAllText($metaPath, $body, (New-Object Text.UTF8Encoding($false)))
                        Write-Host ("  saved template {0}" -f $id) -ForegroundColor Green
                        $res.StatusCode = 200
                        Write-Bytes $res ([Text.Encoding]::UTF8.GetBytes('{"ok":true}')) 'application/json; charset=utf-8'
                    }
                }
            }
        }
        else {
            # ---------- static files ----------
            $file = Join-Path $root ($path.Replace('/', [IO.Path]::DirectorySeparatorChar))
            if ([IO.Directory]::Exists($file)) { $file = Join-Path $file 'index.html' }

            # Refuse anything that escapes the web root (../ and friends).
            $full = [IO.Path]::GetFullPath($file)
            $base = [IO.Path]::GetFullPath($root)
            if (-not $full.StartsWith($base, [StringComparison]::OrdinalIgnoreCase)) {
                $res.StatusCode = 403
            }
            elseif ([IO.File]::Exists($full)) {
                $res.StatusCode  = 200
                $res.ContentType = switch ([IO.Path]::GetExtension($full).ToLower()) {
                    '.html'  { 'text/html; charset=utf-8' }
                    '.js'    { 'application/javascript; charset=utf-8' }
                    '.css'   { 'text/css; charset=utf-8' }
                    '.json'  { 'application/json; charset=utf-8' }
                    '.xlsx'  { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
                    '.pptx'  { 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }
                    '.svg'   { 'image/svg+xml' }
                    '.png'   { 'image/png' }
                    '.jpg'   { 'image/jpeg' }
                    '.jpeg'  { 'image/jpeg' }
                    '.ico'   { 'image/x-icon' }
                    '.woff2' { 'font/woff2' }
                    default  { 'application/octet-stream' }
                }
                # No caching: this doubles as the dev server, and a stale app.js after
                # an edit is the classic half-hour of confusion.
                $res.Headers.Add('Cache-Control', 'no-store, must-revalidate')
                $res.ContentLength64 = (Get-Item $full).Length
                $fs = [IO.File]::OpenRead($full)
                $fs.CopyTo($res.OutputStream)
                $fs.Close()
            }
            else {
                $res.StatusCode = 404
            }
        }
    } catch {
        Write-Host ("  500 {0} - {1}" -f $path, $_.Exception.Message) -ForegroundColor Red
        $res.StatusCode = 500
    }

    try { $res.OutputStream.Close() } catch {}
}
