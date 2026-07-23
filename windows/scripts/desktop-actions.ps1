[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('Preflight', 'Status', 'StopCodexForInstall', 'ApplyImage', 'ApplyPreset', 'ApplySaved', 'Pause')]
  [string]$Action,
  [string]$ImagePath,
  [string]$Name,
  [ValidateLength(0, 40)]
  [ValidatePattern('^[^\x00-\x1F\x7F-\x9F\u2028\u2029]{0,40}$')]
  [string]$Group,
  [ValidateSet('auto', 'light', 'dark')]
  [string]$Appearance = 'auto',
  [ValidateSet('auto', 'left', 'right', 'center', 'none')]
  [string]$SafeArea = 'auto',
  [ValidateSet('auto', 'ambient', 'banner', 'off')]
  [string]$TaskMode = 'auto',
  [ValidateRange(0.0, 1.0)]
  [double]$FocusX = 0.5,
  [ValidateRange(0.0, 1.0)]
  [double]$FocusY = 0.5,
  [ValidatePattern('^[a-z0-9][a-z0-9-]{0,63}$')]
  [string]$ThemeId
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
. (Join-Path $PSScriptRoot 'common-windows.ps1')
. (Join-Path $PSScriptRoot 'theme-windows.ps1')

$SkillRoot = Split-Path -Parent $PSScriptRoot
$StateRoot = Join-Path $env:LOCALAPPDATA 'CodexDreamSkin'
$paths = Get-DreamSkinThemePaths -StateRoot $StateRoot

function Write-DesktopJson {
  param([Parameter(Mandatory = $true)][object]$Value)
  $Value | ConvertTo-Json -Depth 8 -Compress
}

function Get-DesktopStatus {
  $state = $null
  try { $state = Read-DreamSkinState -Path $paths.State } catch {}
  $active = $null
  try { $active = Read-DreamSkinTheme -ThemeDirectory $paths.Active -SkipImageMetadata } catch {}
  $running = $false
  if ($null -ne $state -and $state.injectorPid) {
    $running = $null -ne (Get-Process -Id ([int]$state.injectorPid) -ErrorAction SilentlyContinue)
  }
  $saved = @()
  $codexRunning = $false
  try {
    $codex = Get-DreamSkinCodexInstall
    $codexRunning = (Get-DreamSkinCodexProcesses -Codex $codex).Count -gt 0
  } catch {}
  if (Test-Path -LiteralPath $paths.Saved -PathType Container) {
    $saved = @(Get-DreamSkinSavedThemes -StateRoot $StateRoot -SkipImageMetadata | ForEach-Object {
      [ordered]@{ id = $_.Id; name = $_.Name; path = $_.Path }
    })
  }
  Write-DesktopJson ([ordered]@{
    installed = Test-Path -LiteralPath (Join-Path $PSScriptRoot 'start-dream-skin.ps1') -PathType Leaf
    running = $running
    paused = Test-DreamSkinPaused -StateRoot $StateRoot
    activeThemeName = if ($null -ne $active -and $active.Theme.name) { "$($active.Theme.name)" } else { '' }
    activeImage = if ($null -ne $active) { "$($active.ImagePath)" } else { '' }
    savedThemes = $saved
    codexRunning = $codexRunning
  })
}

switch ($Action) {
  'Preflight' {
    $registered = @(Get-DreamSkinRegisteredCodexInstalls)
    $running = $false
    foreach ($codex in $registered) {
      if ((Get-DreamSkinCodexProcesses -Codex $codex).Count -gt 0) { $running = $true }
    }
    $nodeReady = $true
    try { $null = Get-DreamSkinNodeRuntime } catch { $nodeReady = $false }
    Write-DesktopJson ([ordered]@{
      codexInstalled = $registered.Count -gt 0
      codexRunning = $running
      nodeReady = $nodeReady
    })
  }
  'Status' {
    Get-DesktopStatus
  }
  'StopCodexForInstall' {
    $registered = @(Get-DreamSkinRegisteredCodexInstalls)
    if ($registered.Count -eq 0) { throw 'The official OpenAI.Codex Store package is not installed.' }
    foreach ($codex in $registered) {
      Stop-DreamSkinCodex -Codex $codex -AllowForce
    }
    Write-DesktopJson ([ordered]@{ stopped = $true })
  }
  'ApplyImage' {
    if (-not $ImagePath) { throw 'ApplyImage requires ImagePath.' }
    $themeName = if ($Name -and $Name.Trim()) { $Name.Trim() } else {
      [System.IO.Path]::GetFileNameWithoutExtension($ImagePath)
    }
    $theme = [ordered]@{
      appearance = $Appearance
      art = [ordered]@{ focusX = $FocusX; focusY = $FocusY; safeArea = $SafeArea; taskMode = $TaskMode }
    }
    if ($Group -and $Group.Trim()) { $theme['group'] = $Group.Trim() }
    $result = Set-DreamSkinActiveTheme -ImagePath $ImagePath -Theme $theme -Name $themeName -StateRoot $StateRoot
    $saved = Save-DreamSkinCurrentTheme -Name $themeName -StateRoot $StateRoot
    Set-DreamSkinPaused -Paused $false -StateRoot $StateRoot | Out-Null
    Write-DesktopJson ([ordered]@{
      activeThemeName = "$($result.Theme.name)"
      activeImage = "$($result.ImagePath)"
      savedThemeId = "$($saved.Theme.id)"
    })
  }
  'ApplyPreset' {
    if (-not $ThemeId) { throw 'ApplyPreset requires ThemeId.' }
    $presetRoot = Join-Path $SkillRoot 'presets'
    $presetDirectory = [System.IO.Path]::GetFullPath((Join-Path $presetRoot $ThemeId))
    if (-not (Test-DreamSkinThemePathWithin -Path $presetDirectory -Root $presetRoot)) {
      throw 'Preset must remain inside the preset directory.'
    }
    $preset = Read-DreamSkinTheme -ThemeDirectory $presetDirectory
    $theme = $preset.Theme | ConvertTo-Json -Depth 8 | ConvertFrom-Json
    $result = Set-DreamSkinActiveTheme -ImagePath $preset.ImagePath -Theme $theme -StateRoot $StateRoot
    Set-DreamSkinPaused -Paused $false -StateRoot $StateRoot | Out-Null
    Write-DesktopJson ([ordered]@{ activeThemeName = "$($result.Theme.name)"; activeImage = "$($result.ImagePath)" })
  }
  'ApplySaved' {
    if (-not $ThemeId) { throw 'ApplySaved requires ThemeId.' }
    $themeDirectory = [System.IO.Path]::GetFullPath((Join-Path $paths.Saved $ThemeId))
    if (-not (Test-DreamSkinThemePathWithin -Path $themeDirectory -Root $paths.Saved)) {
      throw 'Saved theme must remain inside the managed theme directory.'
    }
    $savedTheme = Read-DreamSkinTheme -ThemeDirectory $themeDirectory
    $theme = $savedTheme.Theme | ConvertTo-Json -Depth 8 | ConvertFrom-Json
    $result = Set-DreamSkinActiveTheme -ImagePath $savedTheme.ImagePath -Theme $theme -StateRoot $StateRoot
    Set-DreamSkinPaused -Paused $false -StateRoot $StateRoot | Out-Null
    Write-DesktopJson ([ordered]@{ activeThemeName = "$($result.Theme.name)"; activeImage = "$($result.ImagePath)" })
  }
  'Pause' {
    Set-DreamSkinPaused -Paused $true -StateRoot $StateRoot | Out-Null
    $removal = Invoke-DreamSkinLiveRemove -StateRoot $StateRoot
    Write-DesktopJson ([ordered]@{ paused = $true; removed = [bool]$removal.Removed; message = "$($removal.Message)" })
  }
}
