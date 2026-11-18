import secrets
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import PlainTextResponse
from sqlalchemy import select
from sqlalchemy.exc import OperationalError
from starlette.middleware.sessions import SessionMiddleware

from .catalog import POLICIES
from .config import settings
from .db import Budget, Offer, Order, PurchaseRequest, Session, engine
from .schemas import Clarification, Login, NewRequest, Review, SupplierSelection, VendorSimulation
from .service import ProcurementService, row_dict


def actor(request: Request):
    authorization = request.headers.get('authorization', '')
    if authorization.startswith('Bearer '):
        token = authorization[7:]
        if settings.requester_token and secrets.compare_digest(token, settings.requester_token):
            return {'role': 'requester', 'email': 'pratham@procureflow.demo', 'name': 'Pratham Prajapati'}
        if settings.approver_token and secrets.compare_digest(token, settings.approver_token):
            return {'role': 'approver', 'email': 'maya@procureflow.demo', 'name': 'Maya Shah'}
        raise HTTPException(401, 'Invalid API token')
    role = request.session.get('role')
    if not settings.demo_auth and request.session.get('auth_mode') != 'token':
        role = None
    if role is None and settings.demo_auth:
        role = 'requester'
    if role not in ('requester', 'approver'):
        raise HTTPException(401, 'Sign in to continue')
    return {'role': role, 'email': 'pratham@procureflow.demo' if role == 'requester' else 'maya@procureflow.demo', 'name': 'Pratham Prajapati' if role == 'requester' else 'Maya Shah'}


def requester(user=Depends(actor)):
    if user['role'] != 'requester':
        raise HTTPException(403, 'Switch to the requester persona to change or submit a request')
    return user


def approver(user=Depends(actor)):
    if user['role'] != 'approver':
        raise HTTPException(403, 'Only a procurement approver can review proposals')
    return user


def create_app(service=None, seed=True):
    service = service or ProcurementService(Session, engine)

    @asynccontextmanager
    async def lifespan(_):
        service.initialize(seed=seed)
        if seed and settings.agent_mode == 'demo':
            service.seed_requests()
        yield

    app = FastAPI(title='ProcureFlow', version='0.1.0', lifespan=lifespan)
    app.state.service = service
    app.add_middleware(SessionMiddleware, secret_key=settings.session_secret, same_site=settings.session_same_site, https_only=settings.session_https_only, max_age=28800)

    @app.middleware('http')
    async def origin_check(request, call_next):
        if request.method in ('POST', 'PATCH', 'DELETE'):
            origin = request.headers.get('origin')
            if origin and origin not in settings.allowed_origins:
                from fastapi.responses import JSONResponse
                return JSONResponse({'detail': 'Origin is not allowed'}, status_code=403)
        return await call_next(request)

    @app.exception_handler(OperationalError)
    async def db_busy(_, __):
        from fastapi.responses import JSONResponse
        return JSONResponse({'detail': 'Another operation is updating the workspace. Refresh and retry.'}, status_code=409)

    @app.get('/api/health')
    def health():
        return {'status': 'ok', 'agent_mode': settings.agent_mode, 'model_configured': bool(settings.llm_api_key), 'storage': service.engine.dialect.name, 'sandbox': True}

    @app.get('/api/session')
    def session_status(request: Request):
        try:
            user = actor(request)
        except HTTPException:
            user = None
        return {'user': user, 'demo_auth': settings.demo_auth, 'agent_mode': settings.agent_mode}

    @app.post('/api/session')
    def login(data: Login, request: Request):
        if not settings.demo_auth:
            expected = settings.requester_token if data.persona == 'requester' else settings.approver_token
            if not data.token or not secrets.compare_digest(data.token, expected):
                raise HTTPException(401, 'Invalid sign-in token')
        request.session.clear()
        request.session['role'] = data.persona
        request.session['auth_mode'] = 'demo' if settings.demo_auth else 'token'
        return {'user': actor(request), 'demo_auth': settings.demo_auth, 'agent_mode': settings.agent_mode}

    @app.get('/api/workspace')
    def workspace(_=Depends(actor)):
        with service.factory() as session:
            requests = [row_dict(r) for r in session.scalars(select(PurchaseRequest).order_by(PurchaseRequest.created_at.desc()))]
            orders = [row_dict(o) for o in session.scalars(select(Order).order_by(Order.created_at.desc()))]
            budgets = [{**row_dict(b), 'available': b.total - b.committed} for b in session.scalars(select(Budget))]
            return {'requests': requests, 'orders': orders, 'budgets': budgets, 'policies': POLICIES, 'offers': [row_dict(o) for o in session.scalars(select(Offer).order_by(Offer.category, Offer.unit_price))]}

    @app.post('/api/requests', status_code=201)
    def create_request(data: NewRequest, user=Depends(requester)):
        return service.create(data, user['email'])

    @app.get('/api/requests/{request_id}')
    def get_request(request_id: str, _=Depends(actor)):
        return service.detail(request_id)

    def require_owner(request_id, user):
        with service.factory() as session:
            if service.get(session, request_id).owner != user['email']:
                raise HTTPException(403, 'You can only modify your own requests')

    @app.post('/api/requests/{request_id}/run')
    def run_request(request_id: str, user=Depends(requester)):
        require_owner(request_id, user)
        return service.run(request_id)

    @app.post('/api/requests/{request_id}/clarify')
    def clarify(request_id: str, data: Clarification, user=Depends(requester)):
        require_owner(request_id, user)
        if not data.message.strip() and not data.spec:
            raise HTTPException(422, 'Provide a clarification or structured requirements')
        return service.run(request_id, message=data.message, override=data.spec.model_dump(exclude_unset=True, exclude_none=True) if data.spec else None)

    @app.post('/api/requests/{request_id}/review')
    def review(request_id: str, data: Review, user=Depends(approver)):
        return service.review(request_id, data.revision, data.decision, user['email'], data.note)

    @app.post('/api/requests/{request_id}/selection')
    def select_supplier(request_id: str, data: SupplierSelection, user=Depends(approver)):
        return service.select_supplier(request_id, data.revision, data.offer_id, data.reason, user['email'])

    @app.post('/api/requests/{request_id}/order')
    def order(request_id: str, user=Depends(requester)):
        require_owner(request_id, user)
        return service.place_order(request_id)

    @app.post('/api/demo/offers/{offer_id}')
    def simulate(offer_id: str, data: VendorSimulation, _=Depends(actor)):
        if not settings.demo_auth:
            raise HTTPException(404, 'Demo controls are disabled')
        return service.simulate(offer_id, data.available)

    @app.get('/api/orders/{order_id}/download', response_class=PlainTextResponse)
    def download_order(order_id: str, _=Depends(actor)):
        with service.factory() as session:
            order = session.get(Order, order_id)
            if not order:
                raise HTTPException(404, 'Order not found')
            request = service.get(session, order.request_id)
            quote = request.quote
            text = '\n'.join(['PROCUREFLOW · SANDBOX PURCHASE ORDER', '=' * 48, f'Order: {order.id}', f'Request: {order.request_id}', f'Created: {order.created_at}', f'Department: {order.department}', f'Supplier: {order.vendor}', f'Item: {order.product}', f'Quantity: {order.quantity}', f'Total: INR {order.total:,} (inclusive of tax and shipping)', f'Deliver to: {quote["location"]}', f'Delivery deadline: {quote["deadline"]}', f'Approved by: {order.approved_by}', '', 'Synthetic demo data. This document does not place a real order.'])
            return PlainTextResponse(text, headers={'Content-Disposition': f'attachment; filename="{order.id}.txt"'})

    return app


app = create_app()
