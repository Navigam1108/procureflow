from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import JSON, Boolean, ForeignKey, Integer, String, Text, create_engine, event
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

from .config import settings


def now():
    return datetime.now(timezone.utc).isoformat()


def identifier(prefix):
    return f'{prefix}-{uuid4().hex[:10].upper()}'


class Base(DeclarativeBase):
    pass


class Budget(Base):
    __tablename__ = 'budgets'
    department: Mapped[str] = mapped_column(String(80), primary_key=True)
    total: Mapped[int] = mapped_column(Integer)
    committed: Mapped[int] = mapped_column(Integer, default=0)


class Offer(Base):
    __tablename__ = 'offers'
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    vendor: Mapped[str] = mapped_column(String(120))
    product: Mapped[str] = mapped_column(String(200))
    category: Mapped[str] = mapped_column(String(40))
    unit_price: Mapped[int] = mapped_column(Integer)
    stock: Mapped[int] = mapped_column(Integer)
    delivery_days: Mapped[int] = mapped_column(Integer)
    ram_gb: Mapped[int] = mapped_column(Integer, default=0)
    approved: Mapped[bool] = mapped_column(Boolean, default=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    version: Mapped[int] = mapped_column(Integer, default=1)


class PurchaseRequest(Base):
    __tablename__ = 'requests'
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text)
    department: Mapped[str] = mapped_column(String(80))
    owner: Mapped[str] = mapped_column(String(100))
    status: Mapped[str] = mapped_column(String(40), default='new')
    spec: Mapped[dict] = mapped_column(JSON, default=dict)
    checkpoint: Mapped[dict] = mapped_column(JSON, default=dict)
    quote: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    candidates: Mapped[list] = mapped_column(JSON, default=list)
    questions: Mapped[list] = mapped_column(JSON, default=list)
    explanation: Mapped[str] = mapped_column(Text, default='')
    conversation: Mapped[list] = mapped_column(JSON, default=list)
    revision: Mapped[int] = mapped_column(Integer, default=0)
    approved_revision: Mapped[int | None] = mapped_column(Integer, nullable=True)
    approved_by: Mapped[str | None] = mapped_column(String(100), nullable=True)
    approved_digest: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[str] = mapped_column(String(40), default=now)
    updated_at: Mapped[str] = mapped_column(String(40), default=now)


class Trace(Base):
    __tablename__ = 'traces'
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    request_id: Mapped[str] = mapped_column(ForeignKey('requests.id'), index=True)
    kind: Mapped[str] = mapped_column(String(40))
    title: Mapped[str] = mapped_column(String(160))
    detail: Mapped[str] = mapped_column(Text)
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[str] = mapped_column(String(40), default=now)


class Order(Base):
    __tablename__ = 'orders'
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    request_id: Mapped[str] = mapped_column(ForeignKey('requests.id'), unique=True)
    offer_id: Mapped[str] = mapped_column(ForeignKey('offers.id'))
    vendor: Mapped[str] = mapped_column(String(120))
    product: Mapped[str] = mapped_column(String(200))
    quantity: Mapped[int] = mapped_column(Integer)
    total: Mapped[int] = mapped_column(Integer)
    department: Mapped[str] = mapped_column(String(80))
    approved_by: Mapped[str] = mapped_column(String(100))
    created_at: Mapped[str] = mapped_column(String(40), default=now)


def make_engine(url):
    engine = create_engine(url, connect_args={'check_same_thread': False, 'timeout': 30} if url.startswith('sqlite') else {}, pool_pre_ping=True)
    if url.startswith('sqlite'):
        @event.listens_for(engine, 'connect')
        def sqlite_config(connection, _):
            connection.execute('PRAGMA foreign_keys=ON')
            connection.execute('PRAGMA journal_mode=WAL')
    return engine


engine = make_engine(settings.database_url)
Session = sessionmaker(bind=engine, expire_on_commit=False)
