import os
import secrets
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(os.getenv('PROCUREFLOW_ROOT', str(Path(__file__).resolve().parents[2])))
load_dotenv(ROOT / '.env', override=False)
DATA = ROOT / '.data'
DATA.mkdir(exist_ok=True)


def database_url(value):
    # Hosted Postgres providers commonly return these driver-neutral schemes.
    for prefix in ('postgres://', 'postgresql://'):
        if value.startswith(prefix):
            return 'postgresql+psycopg://' + value[len(prefix):]
    return value


class Settings:
    database_url = database_url(os.getenv('DATABASE_URL') or f'sqlite:///{DATA / "procureflow.db"}')
    agent_mode = os.getenv('AGENT_MODE', 'demo')
    llm_base_url = os.getenv('LLM_BASE_URL', 'https://api.groq.com/openai/v1').rstrip('/')
    llm_model = os.getenv('LLM_MODEL', 'openai/gpt-oss-20b')
    llm_api_key = os.getenv('LLM_API_KEY') or os.getenv('GROQ_API_KEY') or os.getenv('OPENAI_API_KEY', '')
    demo_auth = os.getenv('DEMO_AUTH', 'true').lower() == 'true'
    requester_token = os.getenv('REQUESTER_API_TOKEN', '')
    approver_token = os.getenv('APPROVER_API_TOKEN', '')
    session_secret = os.getenv('SESSION_SECRET', '')
    session_https_only = os.getenv('SESSION_HTTPS_ONLY', 'false').lower() == 'true'
    session_same_site = os.getenv('SESSION_SAME_SITE', 'strict').lower()
    allowed_origins = tuple(origin.strip().rstrip('/') for origin in os.getenv('ALLOWED_ORIGINS', 'http://127.0.0.1:3000,http://localhost:3000,http://127.0.0.1:8000,http://localhost:8000').split(',') if origin.strip())


settings = Settings()
if settings.session_same_site not in ('strict', 'lax', 'none'):
    raise RuntimeError('SESSION_SAME_SITE must be strict, lax, or none')
if settings.session_same_site == 'none' and not settings.session_https_only:
    raise RuntimeError('SESSION_SAME_SITE=none requires SESSION_HTTPS_ONLY=true')
if settings.agent_mode not in ('demo', 'live'):
    raise RuntimeError('AGENT_MODE must be demo or live')
if not settings.demo_auth:
    if (len(settings.requester_token) < 24 or len(settings.approver_token) < 24
            or secrets.compare_digest(settings.requester_token, settings.approver_token)
            or len(settings.session_secret) < 32):
        raise RuntimeError('Non-demo auth requires distinct tokens (24+ chars) and SESSION_SECRET (32+ chars).')
if not settings.session_secret:
    secret_path = DATA / 'session.key'
    if not secret_path.exists():
        try:
            with secret_path.open('x') as file:
                file.write(secrets.token_hex(32))
        except FileExistsError:
            pass
    settings.session_secret = secret_path.read_text().strip()
