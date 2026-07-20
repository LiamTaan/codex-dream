[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('Status', 'ApplyImage', 'ApplyPreset', 'Pause')]
  [string]$Action,
  [string]$ImagePath,
  [string]$Name,
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
  })
}

switch ($Action) {
  'Status' {
    Get-DesktopStatus
  }
  'ApplyImage' {
    if (-not $ImagePath) { throw 'ApplyImage requires ImagePath.' }
    $themeName = if ($Name -and $Name.Trim()) { $Name.Trim() } else {
      [System.IO.Path]::GetFileNameWithoutExtension($ImagePath)
    }
    $result = Set-DreamSkinActiveTheme -ImagePath $ImagePath -Theme $null -Name $themeName -StateRoot $StateRoot
    Set-DreamSkinPaused -Paused $false -StateRoot $StateRoot | Out-Null
    Write-DesktopJson ([ordered]@{ activeThemeName = "$($result.Theme.name)"; activeImage = "$($result.ImagePath)" })
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
  'Pause' {
    Set-DreamSkinPaused -Paused $true -StateRoot $StateRoot | Out-Null
    $removal = Invoke-DreamSkinLiveRemove -StateRoot $StateRoot
    Write-DesktopJson ([ordered]@{ paused = $true; removed = [bool]$removal.Removed; message = "$($removal.Message)" })
  }
}
