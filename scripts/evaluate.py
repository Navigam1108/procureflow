"""60 isolated offline scenarios. Reports workflow correctness, not LLM quality."""
import json
import statistics
import sys
import tempfile
import time
from datetime import timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))

from sqlalchemy.orm import sessionmaker

from app.agent import today
from app.config import settings
from app.db import make_engine
from app.schemas import NewRequest, Spec
from app.service import ProcurementService

settings.agent_mode = 'demo'
cases = []
for quantity in range(1, 11):
    cases.extend([
        {'name': f'eligible-laptop-{quantity}', 'quantity': quantity, 'expected': 'awaiting_approval', 'offer': 'OFF-101'},
        {'name': f'32gb-laptop-{quantity}', 'quantity': quantity, 'min_ram_gb': 32, 'expected': 'awaiting_approval', 'offer': 'OFF-103'},
        {'name': f'insufficient-ceiling-{quantity}', 'quantity': quantity, 'budget_limit': 1000, 'expected': 'blocked'},
        {'name': f'urgent-deadline-{quantity}', 'quantity': quantity, 'days': 1, 'expected': 'blocked'},
        {'name': f'supplier-failover-{quantity}', 'quantity': quantity, 'outage': True, 'expected': 'awaiting_approval', 'offer': 'OFF-102'},
        {'name': f'missing-quantity-{quantity}', 'missing': True, 'expected': 'needs_clarification'},
    ])

results = []
with tempfile.TemporaryDirectory(prefix='procureflow-eval-') as directory:
    for index, case in enumerate(cases):
        engine = make_engine(f'sqlite:///{Path(directory) / f"case-{index}.db"}')
        factory = sessionmaker(bind=engine, expire_on_commit=False)
        service = ProcurementService(factory, engine)
        service.initialize()
        if case.get('outage'):
            service.simulate('OFF-101', False)
        spec = Spec(category='laptop', quantity=case.get('quantity'), budget_limit=case.get('budget_limit', 1500000), min_ram_gb=case.get('min_ram_gb', 16), location='Bengaluru', deadline=(today() + timedelta(days=case.get('days', 21))).isoformat())
        start = time.perf_counter()
        request = service.create(NewRequest(title=case['name'], description='Equipment for the engineering team.', spec=spec), 'pratham@procureflow.demo')
        passed = request['status'] == case['expected'] and (not case.get('offer') or request['quote']['id'] == case['offer'])
        if case.get('offer'):
            service.review(request['id'], request['revision'], 'approve', 'maya@procureflow.demo')
            order = service.place_order(request['id'])
            passed = passed and service.place_order(request['id'])['id'] == order['id']
        elapsed = round((time.perf_counter() - start) * 1000, 2)
        results.append({'name': case['name'], 'passed': passed, 'expected_status': case['expected'], 'actual_status': request['status'], 'elapsed_ms': elapsed})
        engine.dispose()

times = sorted(r['elapsed_ms'] for r in results)
report = {
    'mode': 'deterministic_offline_demo', 'date': today().isoformat(), 'scenarios': len(results),
    'passed': sum(r['passed'] for r in results),
    'pass_rate': sum(r['passed'] for r in results) / len(results),
    'median_ms': round(statistics.median(times), 2), 'p95_ms': times[int(len(times) * .95) - 1],
    'scope': 'Synthetic single-line procurement workflows in isolated SQLite databases; successful cases also verify approval and duplicate-order retry. Timings include database writes and are not live-model latency or a production load benchmark.',
    'results': results,
}
destination = Path(__file__).resolve().parents[1] / 'docs' / 'evaluation-report.json'
destination.write_text(json.dumps(report, indent=2), encoding='utf-8')
print(json.dumps({key: value for key, value in report.items() if key != 'results'}, indent=2))
if not all(r['passed'] for r in results):
    raise SystemExit(1)
