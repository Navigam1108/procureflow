"""Run the web workspace and private API inside one Docker Space."""
import os
from pathlib import Path
import signal
import subprocess
import sys
import time
from urllib.request import urlopen


def main():
    root = Path(__file__).resolve().parents[2]
    env = os.environ.copy()
    env.setdefault('PYTHONPATH', str(root / 'backend'))
    if env.get('SPACE_HOST'):
        env.setdefault('ALLOWED_ORIGINS', f'https://{env["SPACE_HOST"]}')
    backend = subprocess.Popen([
        sys.executable, '-m', 'uvicorn', 'app.main:app',
        '--host', '127.0.0.1', '--port', '8000', '--workers', '1',
    ], cwd=root, env=env)
    processes = [backend]
    stopping = False

    def stop(*_):
        nonlocal stopping
        stopping = True
        for process in processes:
            if process.poll() is None:
                process.terminate()

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    exit_code = 0
    try:
        deadline = time.monotonic() + 60
        ready = False
        while time.monotonic() < deadline:
            if stopping or backend.poll() is not None:
                raise RuntimeError('API stopped before becoming ready')
            try:
                with urlopen('http://127.0.0.1:8000/api/health', timeout=1) as response:
                    if response.status == 200:
                        ready = True
                        break
            except OSError:
                pass
            time.sleep(0.5)
        if not ready:
            raise RuntimeError('API did not become ready within 60 seconds')
        frontend_env = dict(env, HOSTNAME='0.0.0.0', PORT=env.get('PORT', '7860'))
        frontend_dir = Path(env.get('PROCUREFLOW_FRONTEND_DIR', root / 'frontend'))
        frontend = subprocess.Popen(
            ['node', str(frontend_dir / 'server.js')],
            cwd=frontend_dir, env=frontend_env,
        )
        processes.append(frontend)
        while not stopping:
            failed = next((p for p in processes if p.poll() is not None), None)
            if failed is not None:
                exit_code = failed.returncode or 1
                break
            time.sleep(0.5)
    finally:
        stop()
        for process in processes:
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
    return exit_code


if __name__ == '__main__':
    raise SystemExit(main())
