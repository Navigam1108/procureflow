"""Expose the same HTTP-backed tools over stdio; no database/auth bypass."""
import os

import httpx
from mcp.server.fastmcp import FastMCP

from .config import settings

mcp = FastMCP('ProcureFlow', instructions='Sandbox procurement tools. Proposals require a separate human approver in the web application. These tools cannot grant approval.')
API_URL = os.getenv('PROCUREFLOW_API_URL', 'http://127.0.0.1:8000')


def call(method, path, body=None):
    token = os.getenv('PROCUREFLOW_API_TOKEN', '')
    headers = {'Authorization': f'Bearer {token}'} if token else {}
    if not token and not settings.demo_auth:
        raise RuntimeError('Configure PROCUREFLOW_API_TOKEN for the requester role.')
    with httpx.Client(base_url=API_URL, timeout=180, headers=headers) as client:
        response = client.request(method, path, json=body)
        response.raise_for_status()
        return response.json()


@mcp.tool()
def search_policy() -> list[dict]:
    """Read authoritative sandbox procurement policies with section citations."""
    return call('GET', '/api/workspace')['policies']


@mcp.tool()
def check_budget(department: str) -> dict:
    """Read the current department budget in whole INR."""
    for budget in call('GET', '/api/workspace')['budgets']:
        if budget['department'] == department:
            return budget
    return {'error': 'Unknown department'}


@mcp.tool()
def search_catalog(category: str) -> list[dict]:
    """Read supplier offers. Final eligibility is computed by the request workflow."""
    return [offer for offer in call('GET', '/api/workspace')['offers'] if offer['category'] == category]


@mcp.tool()
def submit_request(title: str, description: str, department: str = 'Engineering') -> dict:
    """Create and investigate a single-item purchase request. Cannot approve it."""
    return call('POST', '/api/requests', {'title': title, 'description': description, 'department': department})


@mcp.tool()
def get_request(request_id: str) -> dict:
    """Read a request, its proposal, persisted traces, and approval status."""
    return call('GET', f'/api/requests/{request_id}')


@mcp.tool()
def resume_request(request_id: str) -> dict:
    """Retry a failed investigation or replan with fresh supplier data."""
    return call('POST', f'/api/requests/{request_id}/run')


@mcp.tool()
def create_purchase_order(request_id: str) -> dict:
    """Create a sandbox order ONLY after separate human approval of the exact proposal. Retries reuse the existing order."""
    return call('POST', f'/api/requests/{request_id}/order')


if __name__ == '__main__':
    mcp.run(transport='stdio')
