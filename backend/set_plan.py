"""Change an account's plan from the command line (owner only).

  python set_plan.py agen@contoh.com premium 2026-12-31   # premium until that date (inclusive)
  python set_plan.py agen@contoh.com premium              # premium without an end date
  python set_plan.py agen@contoh.com free                 # back to free

Needs MONGO_URL (and DB_NAME if not "sewain") in the environment or backend/.env.
"""
import asyncio
import sys

from plans import set_user_plan


def main() -> None:
    if len(sys.argv) not in (3, 4):
        print(__doc__)
        sys.exit(1)
    email, plan = sys.argv[1], sys.argv[2]
    until = sys.argv[3] if len(sys.argv) == 4 else None
    try:
        result = asyncio.run(set_user_plan(email, plan, until))
    except (LookupError, ValueError) as e:
        print(f'Gagal: {e}')
        sys.exit(1)
    print(f"OK: {result['email']} -> {result['plan']}"
          + (f" sampai {result['premium_until']}" if result['premium_until'] else ''))


if __name__ == '__main__':
    main()
