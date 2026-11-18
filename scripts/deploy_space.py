"""Upload tracked application files to a personal Docker Space."""
import argparse
from pathlib import Path
import subprocess

from huggingface_hub import CommitOperationAdd, HfApi


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('repo_id', help='Personal Space, e.g. owner/procureflow')
    parser.add_argument('--hardware', choices=('cpu-basic', 'cpu-upgrade'), default='cpu-basic')
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    api = HfApi()
    if args.repo_id.split('/')[0] != api.whoami()['name']:
        raise SystemExit('Use a personal Space owned by the signed-in account.')
    tracked = subprocess.check_output(['git', 'ls-files', '-z'], cwd=root).decode().split('\0')
    operations = []
    for name in filter(None, tracked):
        if name == 'README.md':
            continue
        path = root / name
        if name.startswith(('.env', '.data/', '.venv/', '.git/')) and name != '.env.example':
            raise SystemExit(f'Refusing to upload private configuration: {name}')
        if path.suffix in ('.pem', '.key'):
            raise SystemExit(f'Refusing to upload credentials: {name}')
        operations.append(CommitOperationAdd(path_in_repo=name, path_or_fileobj=str(path)))
    operations.append(CommitOperationAdd(
        path_in_repo='README.md', path_or_fileobj=str(root / 'deploy/spaces/README.md'),
    ))
    api.create_repo(
        args.repo_id, repo_type='space', space_sdk='docker', exist_ok=True,
        space_hardware=args.hardware,
        space_sleep_time=300 if args.hardware == 'cpu-upgrade' else None,
    )
    if args.hardware == 'cpu-upgrade':
        api.set_space_sleep_time(args.repo_id, sleep_time=300)
    commit = api.create_commit(
        args.repo_id, repo_type='space', operations=operations,
        commit_message='Deploy ProcureFlow full-stack procurement demo',
    )
    print(commit.commit_url)


if __name__ == '__main__':
    main()
