# NOVA SC Phase 5.7 / 5.7A Validation

This note keeps backend process ownership explicit during transport reconnect
validation on Windows.

## Why this matters

If the frontend still shows `CONNECTED` after you think the backend is stopped,
first verify port `8000`. A second or orphan Python/Uvicorn process can keep the
WebSocket alive, so the UI may be telling the truth.

## Check port 8000

```powershell
netstat -ano | findstr :8000
```

Look for `LISTENING` and note the PID.

## Identify the owning process

Replace `<PID>` with the PID from `netstat`.

```powershell
powershell -Command "Get-CimInstance Win32_Process -Filter \"ProcessId=<PID>\" | Select-Object ProcessId,ExecutablePath,CommandLine"
```

The correct backend should normally run from:

```text
C:\Users\visha\Desktop\NOVA\nova-sc\backend\.venv\Scripts\python.exe
```

A global Python path, for example under `AppData\Local\Programs\Python`, means
the wrong interpreter is serving the backend.

## Helper scripts

From the repo root:

```powershell
.\scripts\check-backend-process.ps1
.\scripts\kill-port-8000.ps1
```

The kill helper targets server-like processes that own local port `8000`. It
does not kill Chrome/client processes unless they are the listener owner, which
Chrome should not be.

## Manual cleanup

```powershell
Stop-Process -Id <PID> -Force
```

Then verify there is no listener:

```powershell
netstat -ano | findstr :8000
```

No `LISTENING` entry should remain.

## Start the correct backend

```powershell
cd C:\Users\visha\Desktop\NOVA\nova-sc\backend
.\.venv\Scripts\activate
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000 --ws websockets
```

## Phase 5.7 reconnect validation

Expected behavior:

- Backend running: frontend shows `CONNECTED`
- Backend stopped: frontend shows `RECONNECTING` within seconds
- Telemetry freshness becomes `STALE` after timeout
- Reconnect attempts increase
- Backend restarted: frontend returns to `CONNECTED`
- Packet rate does not duplicate or explode

If `CONNECTED` persists, run the port check again. There is almost certainly
still a listener on `127.0.0.1:8000`.

## If PID lookup or taskkill fails

Sometimes `netstat` can show a PID as `LISTENING` while `Get-Process`,
`Get-CimInstance`, or `taskkill` cannot inspect or stop it from a normal
terminal. In that case:

1. Open a new PowerShell terminal as Administrator.
2. Re-run:

   ```powershell
   cd C:\Users\visha\Desktop\NOVA\nova-sc
   .\scripts\check-backend-process.ps1
   .\scripts\kill-port-8000.ps1
   ```

3. If the listener still remains after an elevated kill attempt, restart
   Windows before validating reconnect behavior.

An access-denied or unresolvable listener is an operating-system/process
ownership issue, not a telemetry reconnect-state bug.
