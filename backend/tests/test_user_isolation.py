"""End-to-end proof that one signed-in user cannot see or mutate another user's ledger."""
import os
import tempfile
import unittest
import uuid
from pathlib import Path

from dotenv import dotenv_values
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

_temp_dir = tempfile.TemporaryDirectory()
base_url = os.getenv("TEST_DATABASE_URL") or os.getenv("DATABASE_URL") or dotenv_values(Path(__file__).resolve().parents[1] / ".env").get("DATABASE_URL")
if not base_url:
    raise RuntimeError("Set DATABASE_URL to run the PostgreSQL integration tests")

url = make_url(base_url)
if url.get_backend_name() != "postgresql":
    raise RuntimeError("Integration tests require PostgreSQL")

test_database = f"expensely_test_{uuid.uuid4().hex}"
admin_engine = create_engine(url.set(database="postgres"), isolation_level="AUTOCOMMIT")
with admin_engine.connect() as connection:
    connection.execute(text(f'CREATE DATABASE "{test_database}"'))

os.environ["DATABASE_URL"] = url.set(database=test_database).render_as_string(hide_password=False)
os.environ["GMAIL_TOKEN_FILE"] = str(Path(_temp_dir.name) / "no-legacy-token.json")

from fastapi.testclient import TestClient  # noqa: E402

from app.database import create_db_and_tables, engine  # noqa: E402
from app.main import app  # noqa: E402


class UserIsolationTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        create_db_and_tables()
        cls.alice = TestClient(app)
        cls.bob = TestClient(app)
        for client, email in ((cls.alice, "alice@example.com"), (cls.bob, "bob@example.com")):
            response = client.post("/api/auth/register", json={"email": email, "password": "a-safe-password"})
            assert response.status_code == 201, response.text

    @classmethod
    def tearDownClass(cls):
        cls.alice.close()
        cls.bob.close()
        engine.dispose()
        with admin_engine.connect() as connection:
            connection.execute(text(f'DROP DATABASE "{test_database}" WITH (FORCE)'))
        admin_engine.dispose()
        _temp_dir.cleanup()

    def test_ledgers_and_mutations_are_isolated(self):
        alice_account = self.alice.post(
            "/api/bank-accounts",
            json={
                "bank": "Alice Bank",
                "emailAddresses": ["alerts@alice-bank.test"],
                "balance": 1000,
                "minBalance": 100,
                "pools": [{"name": "Personal", "startingAmount": 900, "isAuto": True}],
            },
        )
        self.assertEqual(alice_account.status_code, 201, alice_account.text)
        alice_account_id = alice_account.json()["id"]

        alice_transaction = self.alice.post(
            "/api/expenses/manual",
            json={
                "merchant": "Alice-only purchase",
                "amount": 42,
                "category": "Alice private category",
                "isCashEntry": True,
                "pool": "Personal",
                "type": "Debit",
                "accountId": alice_account_id,
            },
        )
        self.assertEqual(alice_transaction.status_code, 201, alice_transaction.text)
        alice_transaction_id = alice_transaction.json()["id"]

        bob_accounts = self.bob.get("/api/bank-accounts")
        self.assertEqual(bob_accounts.status_code, 200)
        self.assertNotIn("Alice Bank", {row["bank"] for row in bob_accounts.json()})
        self.assertEqual(self.bob.get("/api/expenses").json(), [])
        self.assertNotIn("Alice private category", self.bob.get("/api/categories").json())

        forbidden_account_update = self.bob.put(
            f"/api/bank-accounts/{alice_account_id}",
            json={"bank": "Stolen", "emailAddresses": [], "balance": 0, "minBalance": 0, "pools": []},
        )
        self.assertEqual(forbidden_account_update.status_code, 404)
        forbidden_transaction_update = self.bob.patch(
            f"/api/expenses/{alice_transaction_id}", json={"category": "Stolen"}
        )
        self.assertEqual(forbidden_transaction_update.status_code, 404)

        self.assertEqual(self.alice.get("/api/bank-accounts").status_code, 200)
        self.assertEqual(self.alice.get("/api/expenses").json()[0]["merchant"], "Alice-only purchase")

    def test_logout_does_not_log_out_the_other_user(self):
        self.assertEqual(self.bob.post("/api/auth/logout").status_code, 204)
        self.assertEqual(self.bob.get("/api/auth/me").status_code, 401)
        self.assertEqual(self.alice.get("/api/auth/me").status_code, 200)


if __name__ == "__main__":
    unittest.main()
