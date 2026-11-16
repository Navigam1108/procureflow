from datetime import timedelta

import pytest
from fastapi import HTTPException
from sqlalchemy import select

from app.agent import today
from app.db import Budget, Offer, PurchaseRequest
from app.schemas import NewRequest, Spec
from app.service import ProcurementService

OWNER = 'pratham@procureflow.demo'
REVIEWER = 'maya@procureflow.demo'
REASON = 'Orbit delivers two days earlier, leaving time for the team to set up the laptops.'


def request_with_alternatives(service):
    return service.create(NewRequest(title='Compare hardware suppliers', description='Laptops for the engineering team.', spec=Spec(category='laptop', quantity=2, budget_limit=300000, location='Bengaluru', deadline=(today() + timedelta(days=21)).isoformat())), OWNER)


def test_reviewer_selection_is_shared_and_requires_exact_fresh_approval(service):
    request = request_with_alternatives(service)
    changed = service.select_supplier(request['id'], request['revision'], 'OFF-102', REASON, REVIEWER)
    assert changed['status'] == 'awaiting_approval'
    assert changed['revision'] == request['revision'] + 1
    assert changed['quote']['vendor'] == 'Orbit Business'
    assert changed['quote']['total'] == 163000
    assert changed['quote']['selection_reason'] == REASON
    assert changed['approved_digest'] is None
    with pytest.raises(HTTPException):
        service.place_order(request['id'])
    with pytest.raises(HTTPException):
        service.review(request['id'], request['revision'], 'approve', REVIEWER)
    approved = service.review(request['id'], changed['revision'], 'approve', REVIEWER, 'Earlier arrival is worth the additional cost.')
    assert approved['review']['note'] == 'Earlier arrival is worth the additional cost.'
    assert approved['review']['revision'] == changed['revision']
    order = service.place_order(request['id'])
    assert order['offer_id'] == 'OFF-102'
    with service.factory() as session:
        assert session.get(Offer, 'OFF-101').stock == 24
        assert session.get(Offer, 'OFF-102').stock == 16
        assert session.get(Budget, 'Engineering').committed == 163000
    restarted = ProcurementService(service.factory, service.engine)
    restarted.initialize()
    assert restarted.detail(request['id'])['quote']['selection_reason'] == REASON


@pytest.mark.parametrize('offer_id', ['OFF-104', 'OFF-201', 'does-not-exist'])
def test_reviewer_cannot_select_ineligible_or_uncompared_offer(service, offer_id):
    request = request_with_alternatives(service)
    with pytest.raises(HTTPException):
        service.select_supplier(request['id'], request['revision'], offer_id, REASON, REVIEWER)
    assert service.detail(request['id'])['revision'] == request['revision']


def test_supplier_outage_between_comparison_and_selection_is_denied(service):
    request = request_with_alternatives(service)
    service.simulate('OFF-102', False)
    with pytest.raises(HTTPException) as error:
        service.select_supplier(request['id'], request['revision'], 'OFF-102', REASON, REVIEWER)
    assert error.value.status_code == 409
    assert service.detail(request['id'])['quote']['id'] == 'OFF-101'


def test_unseen_price_change_is_not_silently_selected(service):
    request = request_with_alternatives(service)
    with service.factory.begin() as session:
        session.get(Offer, 'OFF-102').unit_price += 1000
    with pytest.raises(HTTPException) as error:
        service.select_supplier(request['id'], request['revision'], 'OFF-102', REASON, REVIEWER)
    assert error.value.status_code == 409


def test_selection_cannot_modify_an_approved_proposal(service):
    request = request_with_alternatives(service)
    service.review(request['id'], request['revision'], 'approve', REVIEWER)
    with pytest.raises(HTTPException):
        service.select_supplier(request['id'], request['revision'], 'OFF-102', REASON, REVIEWER)


def test_self_selection_and_empty_reason_denied(service):
    request = request_with_alternatives(service)
    with pytest.raises(HTTPException) as error:
        service.select_supplier(request['id'], request['revision'], 'OFF-102', REASON, OWNER)
    assert error.value.status_code == 403
    with pytest.raises(HTTPException) as error:
        service.select_supplier(request['id'], request['revision'], 'OFF-102', '     ', REVIEWER)
    assert error.value.status_code == 422


def test_comparison_selection_api_is_approver_only_and_visible_to_requester(client, service):
    request = request_with_alternatives(service)
    path = f'/api/requests/{request["id"]}/selection'
    body = {'revision': request['revision'], 'offer_id': 'OFF-102', 'reason': REASON}
    assert client.post(path, json=body).status_code == 403
    client.post('/api/session', json={'persona': 'approver'})
    assert client.post(path, json=body).status_code == 200
    assert client.post(path, json=body).status_code == 409
    client.post('/api/session', json={'persona': 'requester'})
    result = client.get(f'/api/requests/{request["id"]}').json()
    assert result['quote']['selection_reason'] == REASON
    assert result['quote']['selected_by'] == REVIEWER
