#Requires -Version 5.1
<#
.SYNOPSIS
Exports the generated website with index.html at the package root.
.DESCRIPTION
Copies the validated site from dist with all its local resources,
preserving relative paths and UTF-8 HTML unchanged.
Run builder.py first when the generated pages need updating.
Only Google Fonts still require Internet access.
.PARAMETER OutputDirectory
Destination relative to the project root, or an absolute path. Must be a
subdirectory of the project's exports directory. An existing package is replaced
only after the packager has validated all source files.
.PARAMETER Zip
Also creates a ZIP beside the output folder, with index.html at the ZIP root.
.PARAMETER PythonExecutable
Python 3.11 or newer with the project's requirements installed. Can be a
command name or a full executable path.
.EXAMPLE
.\scripts\export_package.ps1 -Zip
.EXAMPLE
.\scripts\export_package.ps1 -OutputDirectory exports\publication -Zip
#>
[CmdletBinding()]
param(
    [ValidateNotNullOrEmpty()]
    [string] $OutputDirectory = 'exports/export_package',

    [switch] $Zip,

    [ValidateNotNullOrEmpty()]
    [string] $PythonExecutable = 'python'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$packager = Join-Path $PSScriptRoot 'export_package.py'
$index = Join-Path $projectRoot 'dist/index.html'

if (-not (Test-Path -LiteralPath $index -PathType Leaf)) {
    throw "Missing index.html. Run python builder.py in '$projectRoot' first."
}
if (-not (Get-Command -Name $PythonExecutable -CommandType Application -ErrorAction SilentlyContinue)) {
    throw "Python executable '$PythonExecutable' was not found. Install Python 3.11 or newer, or use -PythonExecutable."
}

# The packager resolves relative output paths against its own project root.
$packagerArguments = @($packager, '--output-dir', $OutputDirectory)
if ($Zip) {
    $packagerArguments += '--zip'
}

& $PythonExecutable @packagerArguments
if ($LASTEXITCODE -ne 0) {
    throw "Export failed (Python exit code $LASTEXITCODE). See the packager error above."
}
