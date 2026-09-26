"""Make a one-time password-reset link for an agent who forgot their password (owner only).

  python reset_link.py agen@contoh.com

Send the printed link to the agent over WhatsApp; it works once, for 24 hours.
Needs MONGO_URL (and PUBLIC_URL for the full link) in the environment or backend/.env.
"""
import asyncio
import os
import sys

from routers_auth import RESET_HOURS, create_reset_token


def main() -> None:
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(1)
    try:
        token = asyncio.run(create_reset_token(sys.argv[1]))
    except LookupError as e:
        print(f'Gagal: {e}')
        sys.exit(1)
    base = os.environ.get('PUBLIC_URL', '').rstrip('/')
    print(f'Link reset password (berlaku {RESET_HOURS} jam, sekali pakai):')
    print(f'{base}/reset?token={token}')


if __name__ == '__main__':
    main()
