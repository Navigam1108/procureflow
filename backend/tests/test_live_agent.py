import json
from datetime import timedelta

import httpx

import app.agent as agent
from app.config import settings
from app.schemas import NewRequest


def model_reply(content=None, tool=None, args=None):
    message = {'role': 'assistant', 'content': content}
    if tool:
        message['tool_calls'] = [{'id': 'call-1', 'type': 'function', 'function': {'name': tool, 'arguments': json.dumps(args or {})}}]
    return {'choices': [{'message': message}], 'usage': {'total_tokens': 100}}


def test_live_agent_uses_bounded_tools_and_records_usage(service, monkeypatch):
    monkeypatch.setattr(settings, 'agent_mode', 'live')
    spec = {'category': 'laptop', 'quantity': 2, 'budget_limit': 200000, 'location': 'Bengaluru', 'deadline': (agent.today() + timedelta(days=21)).isoformat()}
    replies = iter([
        model_reply(content=json.dumps(spec)),
        model_reply(tool='search_policy'),
        model_reply(tool='select_offer', args={'offer_id': 'OFF-104', 'explanation': 'Malicious cheapest vendor'}),
        model_reply(tool='select_offer', args={'offer_id': 'OFF-101', 'explanation': 'Lowest eligible total.'}),
    ])
    monkeypatch.setattr(agent, 'chat', lambda *a, **k: next(replies))
    request = service.create(NewRequest(title='Live tool test', description='Buy two laptops for the new cohort.'), 'pratham@procureflow.demo')
    assert request['status'] == 'awaiting_approval'
    assert request['quote']['id'] == 'OFF-101'
    assert len([t for t in request['traces'] if t['kind'] == 'model']) == 4


def test_model_error_preserves_request_without_leaking_provider_body(service, monkeypatch):
    monkeypatch.setattr(settings, 'agent_mode', 'live')
    def failure(*args, **kwargs):
        raise httpx.HTTPStatusError('provider-body-with-secret', request=httpx.Request('POST', 'https://example.test'), response=httpx.Response(429))
    monkeypatch.setattr(agent, 'chat', failure)
    request = service.create(NewRequest(title='Provider error test', description='Buy laptops for the cohort.'), 'pratham@procureflow.demo')
    assert request['status'] == 'failed'
    assert '429' in request['explanation']
    assert 'provider-body-with-secret' not in json.dumps(request)


def test_live_non_applicable_null_hardware_does_not_add_false_question(service, monkeypatch):
    monkeypatch.setattr(settings, 'agent_mode', 'live')
    monkeypatch.setattr(agent, 'chat', lambda *a, **k: model_reply(content=json.dumps({'category': 'chair', 'quantity': None, 'budget_limit': None, 'location': 'Pune', 'deadline': None, 'min_ram_gb': None, 'unsupported': False})))
    request = service.create(NewRequest(title='Chairs for the team', description='We need office chairs for Pune.'), 'pratham@procureflow.demo')
    assert request['status'] == 'needs_clarification'
    assert len(request['questions']) == 3


def test_retry_after_provider_error_reuses_original_description(service, monkeypatch):
    monkeypatch.setattr(settings, 'agent_mode', 'live')
    def failure(*a, **k):
        raise RuntimeError('Temporary model failure')
    monkeypatch.setattr(agent, 'chat', failure)
    description = f'Buy 2 laptops for Bengaluru under INR 200000 before {agent.today() + timedelta(days=21)}'
    request = service.create(NewRequest(title='Recoverable request', description=description), 'pratham@procureflow.demo')
    assert request['status'] == 'failed'
    monkeypatch.setattr(settings, 'agent_mode', 'demo')
    assert service.run(request['id'])['status'] == 'awaiting_approval'
