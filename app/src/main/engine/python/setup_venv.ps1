[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
Push-Location $PSScriptRoot

try {
    if (-not (Get-Command py -ErrorAction SilentlyContinue)) {
        throw "The Python launcher was not found. Install Python 3.13.14, then rerun setup_venv.ps1."
    }

    $actualPython = & py -3.13 -c "import platform; print(platform.python_version())"
    if ($LASTEXITCODE -ne 0) {
        throw "Python 3.13.14 was not found. Install it, then rerun setup_venv.ps1."
    }
    if ($actualPython -ne "3.13.14") {
        throw "Python 3.13.14 is required; py -3.13 resolved to $actualPython."
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
