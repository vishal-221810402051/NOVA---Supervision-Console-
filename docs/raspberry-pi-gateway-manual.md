# NOVA SC Raspberry Pi Gateway Manual

## 1. Raspberry Pi Identity

Current Pi configuration:

- Hostname: `nova`
- Username: `nova`
- Password: use the private Pi password. Do not publish it in GitHub, reports, screenshots, Jira, or shared documentation.

Recommended SSH target:

```text
nova@nova.local
```

Or use the Pi IP address, for example:

```text
nova@10.17.181.193
```

## 2. Connect to Raspberry Pi Using PuTTY

### Step 1: Open PuTTY

In Windows, open:

```text
PuTTY
```

### Step 2: Enter Host

Use one of these:

```text
nova.local
```

or:

```text
10.17.181.193
```

Settings:

- Connection type: `SSH`
- Port: `22`

Click:

```text
Open
```

### Step 3: Login

When PuTTY asks:

```text
login as:
```

Enter:

```text
nova
```

When it asks for the password, enter the private Pi password.

Note: password characters will not appear while typing. That is normal.

## 3. Connect Using Windows Terminal or PowerShell

Alternative to PuTTY:

```powershell
ssh nova@nova.local
```

or:

```powershell
ssh nova@10.17.181.193
```

Then enter the private Pi password.

## 4. Check Pi Network IP

After login on the Pi, run:

```bash
hostname -I
```

Expected example:

```text
10.17.181.193
```

This IP is used by the laptop frontend WebSocket:

```text
ws://10.17.181.193:8000/ws/telemetry
```

## 5. Navigate to NOVA SC Backend Folder

After SSH login:

```bash
cd ~/NOVA---Supervision-Console-/backend
```

If that path does not exist, check the home folder:

```bash
ls
```

If the repo folder name is different, find it:

```bash
find ~ -maxdepth 2 -type d -iname "*NOVA*"
```

Then enter the backend folder manually, for example:

```bash
cd ~/NOVA---Supervision-Console-/backend
```

or:

```bash
cd ~/nova-sc/backend
```

## 6. Activate Python Virtual Environment

Inside the backend folder, activate the venv:

```bash
source .venv/bin/activate
```

Expected terminal prefix:

```text
(.venv) nova@NOVA:~/.../backend $
```

If `.venv` does not exist:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## 7. Start Backend in Hardware Mode

Use these commands inside the backend folder:

```bash
export NOVA_SC_BACKEND_MODE=hardware
export NOVA_SC_SERIAL_PORT=/dev/serial0
export NOVA_SC_SERIAL_BAUD=115200

python -m uvicorn main:app --host 0.0.0.0 --port 8000 --ws websockets
```

Expected backend state:

```text
Uvicorn running on http://0.0.0.0:8000
```

Important: use `--host 0.0.0.0`, not `127.0.0.1`.

Reason:

- `0.0.0.0` allows the laptop frontend to connect to the Pi backend.
- `127.0.0.1` only allows the Pi itself to connect.

## 8. Keep the Backend Running

Leave this PuTTY or terminal window open.

Do not close it while testing the frontend.

To stop the backend:

```text
CTRL + C
```

## 9. Validate Backend Health on Pi

Open a second PuTTY/SSH session, then run:

```bash
curl -s http://127.0.0.1:8000/health | python3 -m json.tool
```

Expected healthy hardware result:

```json
{
  "backend": "HEALTHY",
  "websocket": "/ws/telemetry",
  "backend_mode": "hardware",
  "bridge_status": "SERIAL_CONNECTED",
  "serial_port": "/dev/serial0",
  "baud": 115200,
  "serial_connected": true,
  "hardware_connected": true,
  "malformed_packet_count": 0,
  "dropped_packet_count": 0,
  "last_esp32_main_packet_utc": "updating",
  "last_esp32_sub_packet_utc": null,
  "last_error": null
}
```

Critical fields:

```text
backend_mode = hardware
bridge_status = SERIAL_CONNECTED
serial_connected = true
malformed_packet_count = 0
dropped_packet_count = 0
last_esp32_main_packet_utc = updating
last_error = null
```

## 10. Validate Pi UART Device

Run:

```bash
ls -l /dev/serial0
```

Expected:

```text
/dev/serial0 -> ttyS0
```

Check user permissions:

```bash
groups
```

Expected group includes:

```text
dialout
```

If `dialout` is missing:

```bash
sudo usermod -a -G dialout nova
sudo reboot
```

## 11. NOVA B1 to Pi Wiring

Current validated wiring:

```text
NOVA B1 J2 PI_UART_RX -> Pi GPIO15 RXD / physical pin 10
NOVA B1 J2 GND        -> Pi GND / physical pin 6
```

Do not connect yet:

- Pi TX
- Pi 3V3
- Pi 5V
- SUB ESP32
- motors
- servos
- steppers
- pumps
- valves
- relays
- actuator power

Important: this phase is telemetry-only.

## 12. Start Laptop Frontend in Hardware Mode

On Windows PowerShell:

```powershell
cd C:\Users\visha\Desktop\NOVA\nova-sc\frontend

$env:VITE_NOVA_SC_WS_URL="ws://10.17.181.193:8000/ws/telemetry"

npm run dev
```

Replace `10.17.181.193` with the current Pi IP from:

```bash
hostname -I
```

Open browser:

```text
http://localhost:5173
```

Expected frontend:

```text
WS State = CONNECTED
Active Source = Pi Hardware WebSocket
Simulated Source = FALSE
Schema Rejected = 0
Malformed = 0
Unknown Nodes = 0
Unknown Links = 0
esp32_main = HEALTHY
link_pi_main = LINK_HEALTHY / SYNCED
```

## 13. Stop Hardware Frontend Mode

In the frontend terminal:

```text
CTRL + C
```

To clear the hardware WebSocket setting:

```powershell
Remove-Item Env:VITE_NOVA_SC_WS_URL -ErrorAction SilentlyContinue
```

Then local default mode can run again:

```powershell
npm run dev
```

## 14. Common Problems and Fixes

### Problem: Frontend Says WS CONNECTING

Check whether the laptop can reach the Pi:

```powershell
Invoke-RestMethod http://10.17.181.193:8000/health
```

If this fails, check:

- Pi backend is running.
- Backend uses `--host 0.0.0.0`.
- Pi IP is correct.
- Laptop and Pi are on the same network.

### Problem: `/health` Says `WAITING_FOR_HARDWARE_PACKETS`

This means the backend is running, but the Pi is not receiving ESP32 UART packets.

Check:

- ESP32 is powered.
- Firmware is flashed.
- J2 `PI_UART_RX` is connected to Pi GPIO15 RXD.
- GND is connected.
- Baud is `115200`.
- Serial port is `/dev/serial0`.

### Problem: `malformed_packet_count` Increases

Possible causes:

- wrong UART pin
- wrong baud rate
- loose GND
- partial serial line
- ESP32 reset during stream
- wrong firmware

Expected stable state:

```text
malformed_packet_count = 0
dropped_packet_count = 0
```

One malformed packet at startup can be acceptable if it does not continue increasing.

### Problem: COM3 Busy on Windows

Close:

- PlatformIO monitor
- VS Code Serial Monitor
- Arduino Serial Monitor
- PuTTY serial

Then retry upload or monitor.

## 15. Standard Pi Backend Startup Commands

Use this block every time:

```bash
cd ~/NOVA---Supervision-Console-/backend

source .venv/bin/activate

export NOVA_SC_BACKEND_MODE=hardware
export NOVA_SC_SERIAL_PORT=/dev/serial0
export NOVA_SC_SERIAL_BAUD=115200

python -m uvicorn main:app --host 0.0.0.0 --port 8000 --ws websockets
```

If your repo folder is different, replace the first `cd` path.

## 16. Standard Health Check Commands

On Pi:

```bash
curl -s http://127.0.0.1:8000/health | python3 -m json.tool
```

From Windows laptop:

```powershell
Invoke-RestMethod http://10.17.181.193:8000/health
```
