import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker

from app.config import settings
from app.db import make_engine
from app.main import create_app
from app.service import ProcurementService


@pytest.fixture
def service(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, 'agent_mode', 'demo')
    monkeypatch.setattr(settings, 'demo_auth', True)
    engine = make_engine(f'sqlite:///{tmp_path / "test.db"}')
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    service = ProcurementService(factory, engine)
    service.initialize()
    yield service
    engine.dispose()


@pytest.fixture
def client(service):
    # Seed budgets/catalog above; keep request table empty for API assertions.
    with TestClient(create_app(service, seed=False)) as client:
        yield client
