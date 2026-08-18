[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
Push-Location $PSScriptRoot

try {
    # Floor, not exact pin — matches setup_venv.sh; an exact pin broke on every patch release.
    $requiredMinor = "3.13"
    $requiredPatch = 14
    $installHelp = "Install it with the Python installer from python.org (check " +
        "'Add python.exe to PATH'), or 'winget install Python.Python.3.13', then rerun setup_venv.ps1."

    if (-not (Get-Command py -ErrorAction SilentlyContinue)) {
        throw "The Python launcher (py) was not found. $installHelp"
    }

    $actualPython = & py "-$requiredMinor" -c "import platform; print(platform.python_version())"
    if ($LASTEXITCODE -ne 0) {
        throw "Python $requiredMinor was not found via 'py -$requiredMinor'. $installHelp"
    }
    $actualPatch = [int]($actualPython.Split(".")[2])
    if ($actualPatch -lt $requiredPatch) {
        throw "Python $requiredMinor.$requiredPatch or a later $requiredMinor.x is required; " +
            "py -$requiredMinor resolved to $actualPython. $installHelp"
    }

    & py -3.13 -m venv .venv
    if ($LASTEXITCODE -ne 0) {
        throw "Creating the Python virtual environment failed with exit code $LASTEXITCODE."
    }

    & .\.venv\Scripts\python.exe -m pip install --quiet -r requirements.txt
    if ($LASTEXITCODE -ne 0) {
        throw "Installing QRE dependencies failed with exit code $LASTEXITCODE."
    }

    Write-Output "Python venv ready at $PSScriptRoot\.venv"
}
finally {
    Pop-Location
}
