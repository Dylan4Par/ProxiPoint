<#
  Pull Claude's latest work into the branch you're on.

    .\sync.ps1            save your changes, fetch, merge origin/ui/four-tab-nav
    .\sync.ps1 -Watch     keep doing that every 30 seconds (Ctrl+C to stop)
    .\sync.ps1 -Push      also push your branch to GitHub afterwards

  Your own edits are committed first ("wip: ..."), so nothing is lost. If the merge has a
  conflict it is undone and nothing changes; paste the output to Claude.
  Leave `npx expo start` running in another window: Metro reloads the app by itself.
#>
param(
  [string]$Branch = 'ui/four-tab-nav',
  [switch]$Watch,
  [int]$Every = 30,
  [switch]$Push
)

$ErrorActionPreference = 'Continue'
Set-Location $PSScriptRoot

function Sync-Once {
  # 1. Save local changes.
  if (git status --porcelain) {
    git add -A
    git commit -q -m "wip: local changes $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
    Write-Host 'Saved your local changes.' -ForegroundColor DarkGray
  }

  # 2. Anything new?
  git fetch -q origin $Branch
  if ($LASTEXITCODE -ne 0) { Write-Warning 'Fetch failed (offline?).'; return }
  $behind = [int](git rev-list --count "HEAD..origin/$Branch")
  if ($behind -eq 0) { Write-Host "$(Get-Date -Format 'HH:mm:ss')  Up to date." -ForegroundColor DarkGray; return }

  # 3. Merge it.
  $before = git rev-parse HEAD
  git merge -q --no-edit "origin/$Branch"
  if ($LASTEXITCODE -ne 0) {
    git merge --abort
    Write-Warning 'Merge conflict. Undone, nothing changed. Paste this output to Claude.'
    return
  }
  Write-Host "$(Get-Date -Format 'HH:mm:ss')  Merged $behind new commit(s):" -ForegroundColor Green
  git log --oneline "$before..HEAD" --no-merges | ForEach-Object { Write-Host "  $_" }

  # 4. Follow-ups some changes need.
  $changed = git diff --name-only $before HEAD
  if ($changed -match 'package(-lock)?\.json$') {
    Write-Host 'Packages changed: running npm install...' -ForegroundColor Yellow
    npm install
  }
  if ($changed -match '(^|/)(android/|app\.json$)') {
    Write-Host 'Native config changed: rebuild with  npx expo run:android' -ForegroundColor Yellow
  }

  if ($Push) {
    git push -q -u origin HEAD
    if ($LASTEXITCODE -eq 0) { Write-Host 'Pushed.' -ForegroundColor DarkGray }
  }
}

Sync-Once
while ($Watch) {
  Start-Sleep -Seconds $Every
  Sync-Once
}
