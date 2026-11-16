"""Exercise configured live model calls using synthetic data; never prints keys."""
import json
import sys
from datetime import timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))

import httpx
from app.agent import today

with httpx.Client(base_url='http://127.0.0.1:8000', timeout=180) as client:
    health = client.get('/api/health').json()
    if health['agent_mode'] != 'live' or not health['model_configured']:
        raise SystemExit('Configure live mode and a key in .env, then restart the backend.')
    response = client.post('/api/requests', json={'title': 'Live Groq verification · 2 developer laptops', 'description': f'We need 2 developer laptops with 16 GB RAM for the Bengaluru office, total budget INR 200000, delivered before {today() + timedelta(days=21)}.', 'department': 'Engineering'})
    response.raise_for_status()
    request = response.json()
    output = {'request_id': request['id'], 'status': request['status'], 'spec': request['spec'], 'selected_offer': request['quote']['id'] if request['quote'] else None, 'model_calls': len([t for t in request['traces'] if t['kind'] == 'model']), 'explanation': request['explanation']}
    print(json.dumps(output, indent=2))
    if request['status'] != 'awaiting_approval':
        raise SystemExit(1)
