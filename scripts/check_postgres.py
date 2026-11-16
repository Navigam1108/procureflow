"""Run only against a disposable, dedicated local database, never an existing workspace."""
import os
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))

from sqlalchemy import func, select
from sqlalchemy.orm import sessionmaker
from app.agent import today
from app.config import settings
from app.db import Budget, Offer, Order, make_engine
from app.schemas import NewRequest, Spec
from app.service import ProcurementService

url = os.environ['PROCUREFLOW_TEST_POSTGRES_URL']
if not url.endswith('/procureflow_mvp_test'):
    raise SystemExit('This smoke check requires a dedicated database named procureflow_mvp_test.')
settings.agent_mode = 'demo'
engine = make_engine(url)
factory = sessionmaker(bind=engine, expire_on_commit=False)
service = ProcurementService(factory, engine)
service.initialize()
with factory() as session:
    if session.scalar(select(func.count(Order.id))):
        raise SystemExit('Use a fresh disposable database for this smoke check.')
request = service.create(NewRequest(title='PostgreSQL transaction smoke check', description='Two laptops for the Bengaluru office.', spec=Spec(category='laptop', quantity=2, budget_limit=200000, location='Bengaluru', deadline=(today() + timedelta(days=21)).isoformat())), 'requester@test.demo')
assert request['status'] == 'awaiting_approval'
service.review(request['id'], request['revision'], 'approve', 'approver@test.demo')
with ThreadPoolExecutor(max_workers=2) as pool:
    orders = list(pool.map(service.place_order, [request['id'], request['id']]))
assert orders[0]['id'] == orders[1]['id']
with factory() as session:
    assert session.scalar(select(func.count(Order.id))) == 1
    assert session.get(Offer, 'OFF-101').stock == 22
    assert session.get(Budget, 'Engineering').committed == 145800
print('PostgreSQL smoke check passed: approval, concurrent duplicate checkout, inventory, and budget.')
engine.dispose()
