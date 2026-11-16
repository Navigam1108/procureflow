import hashlib
import json
from datetime import date, timedelta

from fastapi import HTTPException
from sqlalchemy import select, update

from .agent import build_agent, today
from .catalog import DEPARTMENTS, OFFERS, POLICIES
from .config import settings
from .db import Base, Budget, Offer, Order, PurchaseRequest, Trace, identifier, now


def trace(session, request_id, kind, title, detail, payload=None):
    session.add(Trace(request_id=request_id, kind=kind, title=title, detail=detail, payload=payload or {}))


def row_dict(row):
    return {column.name: getattr(row, column.name) for column in row.__table__.columns}


def digest(quote):
    return hashlib.sha256(json.dumps(quote, sort_keys=True).encode()).hexdigest()


class ProcurementService:
    def __init__(self, factory, engine):
        self.factory, self.engine = factory, engine

    def initialize(self, seed=True):
        Base.metadata.create_all(self.engine)
        with self.factory.begin() as session:
            # Runs have no external write tools. An interrupted investigation may
            # safely replay read tools; orders are a separate atomic transaction.
            running = session.scalars(select(PurchaseRequest).where(PurchaseRequest.status == 'running')).all()
            for request in running:
                request.status = 'failed'
                request.explanation = 'The service restarted during planning. Resume to replay the read-only investigation from saved requirements.'
                trace(session, request.id, 'recovery', 'Interrupted run recovered', request.explanation)
            if seed and not session.scalar(select(Budget.department).limit(1)):
                session.add_all([Budget(department=k, total=v, committed=0) for k, v in DEPARTMENTS.items()])
                session.add_all([Offer(**offer) for offer in OFFERS])

    def get(self, session, request_id, lock=False):
        statement = select(PurchaseRequest).where(PurchaseRequest.id == request_id)
        if lock:
            statement = statement.with_for_update()
        request = session.scalar(statement)
        if request is None:
            raise HTTPException(404, 'Request not found')
        return request

    def detail(self, request_id):
        with self.factory() as session:
            request = self.get(session, request_id)
            result = row_dict(request)
            result['traces'] = [row_dict(t) for t in session.scalars(select(Trace).where(Trace.request_id == request_id).order_by(Trace.id))]
            order = session.scalar(select(Order).where(Order.request_id == request_id))
            result['order'] = row_dict(order) if order else None
            result['policies'] = POLICIES
            result['review'] = next((t['payload'] for t in reversed(result['traces']) if t['kind'] == 'approval' and t['payload'].get('reviewer') and t['payload'].get('revision') == request.revision), None)
            return result

    def create(self, data, owner):
        with self.factory.begin() as session:
            request = PurchaseRequest(id=identifier('REQ'), title=data.title, description=data.description, department=data.department, owner=owner, spec=data.spec.model_dump(exclude_unset=True, exclude_none=True) if data.spec else {})
            session.add(request)
            session.flush()
            trace(session, request.id, 'request', 'Purchase request received', data.description)
            request_id = request.id
        return self.run(request_id)

    def budget(self, session, department):
        budget = session.get(Budget, department)
        if budget is None:
            raise HTTPException(400, 'Unknown department')
        return {**row_dict(budget), 'available': budget.total - budget.committed, 'currency': 'INR'}

    def offers(self, session, spec, department):
        budget = self.budget(session, department)
        offers = session.scalars(select(Offer).where(Offer.category == spec['category']).order_by(Offer.unit_price)).all()
        results = []
        for offer in offers:
            reasons = []
            total = offer.unit_price * spec['quantity']
            if not offer.active:
                reasons.append('Supplier unavailable')
            if not offer.approved:
                reasons.append('Supplier is not approved · POL-001 §2.1')
            if offer.stock < spec['quantity']:
                reasons.append(f'Only {offer.stock} units in stock')
            if total > spec['budget_limit']:
                reasons.append('Exceeds request ceiling · POL-002 §3.2')
            if total > budget['available']:
                reasons.append('Exceeds department budget · POL-002 §3.2')
            arrival = today() + timedelta(days=offer.delivery_days)
            if arrival > date.fromisoformat(spec['deadline']):
                reasons.append('Misses delivery deadline · POL-004 §5.3')
            if offer.category == 'laptop' and offer.ram_gb < max(16, spec.get('min_ram_gb', 16)):
                reasons.append('Insufficient RAM · POL-004 §5.3')
            results.append({**row_dict(offer), 'total': total, 'arrival': arrival.isoformat(), 'eligible': not reasons, 'reasons': reasons})
        return results

    def run(self, request_id, message=None, override=None):
        with self.factory.begin() as session:
            request = self.get(session, request_id)
            if request.status in ('ordered', 'rejected', 'approved', 'running'):
                raise HTTPException(409, f'Cannot plan a request in {request.status} state')
            previous_status = request.status
            revision = request.revision
            previous_spec = request.spec
            # A compare-and-swap prevents simultaneous runs from overwriting state.
            updated = session.execute(update(PurchaseRequest).where(PurchaseRequest.id == request_id, PurchaseRequest.revision == revision, PurchaseRequest.status == previous_status).values(status='running', revision=revision + 1, approved_by=None, approved_revision=None, approved_digest=None, quote=None, updated_at=now()))
            if updated.rowcount != 1:
                raise HTTPException(409, 'Another run has already started')
            if message:
                request.conversation = [*request.conversation, {'role': 'user', 'content': message, 'created_at': now()}]
            department = request.department
            # Once requirements are saved, a retry must not reintroduce values
            # from the original text over a later clarification.
            source = message or (request.description if previous_status == 'new' or not previous_spec else '')
            # Submitted form values are authoritative over text extraction.
            structured = override if override is not None else (previous_spec if previous_status == 'new' else {})
            trace(session, request_id, 'agent', 'Planning started', f"{'Offline demo' if settings.agent_mode == 'demo' else 'Live model'} · proposal revision {revision + 1}", {'mode': settings.agent_mode, 'revision': revision + 1})

        def record(kind, title, detail, payload=None):
            with self.factory.begin() as session:
                trace(session, request_id, kind, title, detail, payload)
                if kind == 'checkpoint':
                    request = self.get(session, request_id)
                    request.checkpoint = payload
                    request.spec = payload['spec']

        def tools(name, arguments):
            with self.factory() as session:
                if name == 'search_policy':
                    output = POLICIES
                    detail = f'Retrieved {len(output)} authoritative policy sections.'
                elif name == 'check_budget':
                    output = self.budget(session, department)
                    detail = f"{department} has INR {output['available']:,} available."
                elif name == 'search_catalog':
                    output = self.offers(session, arguments['spec'], department)
                    detail = f"Checked {len(output)} offers; {sum(o['eligible'] for o in output)} meet all constraints."
                else:
                    raise ValueError('Unknown tool')
            record('tool', name, detail, {'arguments': arguments, 'result': output})
            return output

        try:
            result = build_agent(tools, record, settings.agent_mode).invoke({'description': source, 'previous': previous_spec, 'override': structured})
            with self.factory.begin() as session:
                request = self.get(session, request_id)
                request.spec = result['spec']
                request.questions = result['questions']
                request.candidates = result.get('candidates', [])
                request.status = 'needs_clarification' if result['questions'] else result['status']
                request.explanation = 'A few details are needed before I can compare suppliers.' if result['questions'] else result['explanation']
                if result.get('selection'):
                    chosen = next(c for c in result['candidates'] if c['id'] == result['selection'])
                    request.quote = {key: chosen[key] for key in ('id', 'vendor', 'product', 'category', 'unit_price', 'total', 'delivery_days', 'arrival', 'version')}
                    request.quote = {**request.quote, 'quantity': result['spec']['quantity'], 'location': result['spec']['location'], 'deadline': result['spec']['deadline'], 'revision': request.revision, 'currency': 'INR'}
                request.updated_at = now()
                trace(session, request_id, 'approval' if request.quote else 'decision', 'Proposal ready for review' if request.quote else 'More information needed' if result['questions'] else 'No compliant offer found', request.explanation, {'status': request.status})
        except Exception as exc:
            # Never expose provider response bodies, credentials, or internal paths.
            detail = 'The planning step failed. Your request and checkpoints are saved; retry after checking model configuration or service availability.'
            if isinstance(exc, RuntimeError):
                detail = str(exc)[:300]
            elif hasattr(exc, 'response') and getattr(exc, 'response', None) is not None:
                code = exc.response.status_code
                detail = f'The model provider returned HTTP {code}. Check your API key, model access, or rate limit, then resume the investigation.'
            with self.factory.begin() as session:
                request = self.get(session, request_id)
                request.status, request.explanation, request.updated_at = 'failed', detail, now()
                trace(session, request_id, 'error', 'Planning paused', detail, {'error_type': type(exc).__name__})
        return self.detail(request_id)

    def select_supplier(self, request_id, revision, offer_id, reason, reviewer):
        reason = reason.strip()
        if len(reason) < 5:
            raise HTTPException(422, 'Explain the supplier choice in at least five characters')
        with self.factory.begin() as session:
            request = self.get(session, request_id, lock=True)
            if request.owner == reviewer:
                raise HTTPException(403, 'A separate procurement reviewer must select the supplier')
            if request.status != 'awaiting_approval' or request.revision != revision:
                raise HTTPException(409, 'Proposal changed or has already been reviewed. Refresh the comparison.')
            snapshot = next((o for o in request.candidates if o['id'] == offer_id), None)
            if not snapshot:
                raise HTTPException(422, 'Choose an offer from this request’s supplier comparison')
            # Revalidate current data, and reject unseen quote changes rather than
            # silently choosing a different price from the one Maya compared.
            current_offers = self.offers(session, request.spec, request.department)
            selected = next((o for o in current_offers if o['id'] == offer_id), None)
            if not selected or not selected['eligible']:
                raise HTTPException(409, 'This supplier no longer meets the requirements. Replan the request for fresh offers.')
            if any(selected[key] != snapshot[key] for key in ('version', 'unit_price', 'product', 'delivery_days', 'arrival')):
                raise HTTPException(409, 'This offer changed since the comparison. Replan before choosing it.')
            previous_quote = request.quote
            new_revision = revision + 1
            quote = {key: selected[key] for key in ('id', 'vendor', 'product', 'category', 'unit_price', 'total', 'delivery_days', 'arrival', 'version')}
            quote.update(quantity=request.spec['quantity'], location=request.spec['location'], deadline=request.spec['deadline'], revision=new_revision, currency='INR', selected_by=reviewer, selection_reason=reason)
            updated = session.execute(update(PurchaseRequest).where(PurchaseRequest.id == request_id, PurchaseRequest.status == 'awaiting_approval', PurchaseRequest.revision == revision).values(quote=quote, candidates=current_offers, revision=new_revision, approved_by=None, approved_revision=None, approved_digest=None, updated_at=now()))
            if updated.rowcount != 1:
                raise HTTPException(409, 'Another reviewer updated the proposal. Refresh before choosing.')
            trace(session, request_id, 'selection', 'Reviewer selected a supplier', reason, {'reviewer': reviewer, 'revision': new_revision, 'previous_offer_id': previous_quote['id'] if previous_quote else None, 'offer_id': offer_id, 'vendor': selected['vendor'], 'total': selected['total'], 'reason': reason})
        return self.detail(request_id)

    def review(self, request_id, revision, decision, approver, note=''):
        with self.factory.begin() as session:
            request = self.get(session, request_id, lock=True)
            if request.owner == approver:
                raise HTTPException(403, 'A different person must review the request')
            if request.revision != revision or request.status != 'awaiting_approval':
                raise HTTPException(409, 'Proposal changed or has already been reviewed. Refresh before reviewing.')
            status = 'approved' if decision == 'approve' else 'rejected'
            updated = session.execute(update(PurchaseRequest).where(PurchaseRequest.id == request_id, PurchaseRequest.status == 'awaiting_approval', PurchaseRequest.revision == revision).values(status=status, approved_revision=revision if decision == 'approve' else None, approved_by=approver, approved_digest=digest(request.quote) if decision == 'approve' else None, updated_at=now()))
            if updated.rowcount != 1:
                raise HTTPException(409, 'Another review has already completed')
            trace(session, request_id, 'approval', 'Proposal approved' if decision == 'approve' else 'Request rejected', note or f'Proposal revision {revision} reviewed by {approver}.', {'reviewer': approver, 'revision': revision, 'decision': decision, 'note': note, 'offer_id': request.quote['id'] if request.quote else None})
        return self.detail(request_id)

    def place_order(self, request_id):
        try:
            return self._place_order(request_id)
        except HTTPException as error:
            # A concurrent duplicate may lose the CAS after the first commits.
            # Return the winning order after rolling back the losing transaction.
            if error.status_code == 409:
                with self.factory() as session:
                    existing = session.scalar(select(Order).where(Order.request_id == request_id))
                    if existing:
                        return row_dict(existing)
            raise

    def _place_order(self, request_id):
        stale = None
        with self.factory.begin() as session:
            request = self.get(session, request_id, lock=True)
            existing = session.scalar(select(Order).where(Order.request_id == request_id))
            if existing:
                return row_dict(existing)
            if request.status != 'approved' or request.approved_revision != request.revision or not request.quote or request.approved_digest != digest(request.quote):
                raise HTTPException(409, 'An approver must approve the current exact proposal first')
            quote = request.quote
            offer = session.scalar(select(Offer).where(Offer.id == quote['id']).with_for_update())
            candidates = self.offers(session, request.spec, request.department)
            current = next((o for o in candidates if o['id'] == quote['id']), None)
            if not current or not current['eligible'] or offer.version != quote['version'] or current['total'] != quote['total']:
                stale = 'Supplier availability, quote, delivery, or budget changed. Replan and obtain approval for a fresh proposal.'
                request.status = 'needs_replan'
                request.approved_revision = request.approved_digest = request.approved_by = None
                request.explanation = stale
                trace(session, request_id, 'recovery', 'Fresh approval required', stale)
            else:
                # Conditional writes protect against races across different requests.
                reserved = session.execute(update(Offer).where(Offer.id == offer.id, Offer.stock >= quote['quantity'], Offer.version == quote['version'], Offer.active.is_(True)).values(stock=Offer.stock - quote['quantity']))
                funded = session.execute(update(Budget).where(Budget.department == request.department, Budget.total - Budget.committed >= quote['total']).values(committed=Budget.committed + quote['total']))
                claimed = session.execute(update(PurchaseRequest).where(PurchaseRequest.id == request_id, PurchaseRequest.status == 'approved', PurchaseRequest.revision == request.revision).values(status='ordered', updated_at=now()))
                if reserved.rowcount != 1 or funded.rowcount != 1 or claimed.rowcount != 1:
                    raise HTTPException(409, 'Availability changed during checkout. Refresh and retry; nothing was charged.')
                order = Order(id=identifier('PO'), request_id=request_id, offer_id=offer.id, vendor=quote['vendor'], product=quote['product'], quantity=quote['quantity'], total=quote['total'], department=request.department, approved_by=request.approved_by)
                session.add(order)
                session.flush()
                trace(session, request_id, 'order', 'Purchase order created', f"{order.id} · INR {order.total:,}. Stock and budget committed atomically.", {'order_id': order.id})
                output = row_dict(order)
        if stale:
            raise HTTPException(409, stale)
        return output

    def simulate(self, offer_id, available):
        with self.factory.begin() as session:
            offer = session.get(Offer, offer_id)
            if not offer:
                raise HTTPException(404, 'Offer not found')
            session.execute(update(Offer).where(Offer.id == offer_id).values(active=available, version=Offer.version + 1))
        return {'id': offer_id, 'available': available}

    def seed_requests(self):
        from .schemas import NewRequest
        with self.factory() as session:
            if session.scalar(select(PurchaseRequest.id).limit(1)):
                return
        deadline = (today() + timedelta(days=21)).isoformat()
        for data in [
            NewRequest(title='Developer laptops for the new cohort', description=f'We need 12 developer laptops with 16 GB RAM for the Bengaluru office, under INR 1500000, delivered before {deadline}.', department='Engineering'),
            NewRequest(title='Monitors for the design studio', description=f'We need 8 monitors for the Mumbai office under INR 250000, delivered before {deadline}.', department='Design'),
            NewRequest(title='Seating for the operations floor', description='We need office chairs for the Pune office.', department='Operations'),
        ]:
            self.create(data, 'pratham@procureflow.demo')
