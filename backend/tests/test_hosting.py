from fastapi.testclient import TestClient

from app.config import database_url, settings
from app.main import create_app


def test_hosted_database_scheme_uses_installed_psycopg_driver():
    expected = 'postgresql+psycopg://demo:placeholder@db.example/test?sslmode=require'
    assert database_url('postgres://demo:placeholder@db.example/test?sslmode=require') == expected
    assert database_url('postgresql://demo:placeholder@db.example/test?sslmode=require') == expected
    assert database_url(expected) == expected
    assert database_url('sqlite:///local.db') == 'sqlite:///local.db'


def test_only_configured_hosted_origin_can_mutate(client, monkeypatch):
    monkeypatch.setattr(settings, 'allowed_origins', ('https://procureflow.example',))
    assert client.post('/api/session', json={'persona': 'approver'}, headers={'Origin': 'https://procureflow.example'}).status_code == 200
    assert client.post('/api/session', json={'persona': 'approver'}, headers={'Origin': 'https://other.example'}).status_code == 403


def test_secure_session_cookie_for_https_hosting(service, monkeypatch):
    monkeypatch.setattr(settings, 'session_https_only', True)
    with TestClient(create_app(service, seed=False), base_url='https://procureflow.example') as client:
        response = client.post('/api/session', json={'persona': 'approver'})
        cookie = response.headers['set-cookie'].lower()
        assert 'secure' in cookie and 'httponly' in cookie and 'samesite=strict' in cookie
        assert client.get('/api/session').json()['user']['role'] == 'approver'
