import unittest

from app.mail.extractor import looks_like_hdfc_transaction, try_extract_hdfc
from app.models import DEFAULT_CATEGORIES, TransactionType


class HdfcParserTests(unittest.TestCase):
    def test_parses_known_debit_template_without_ai(self):
        body = (
            "Rs.1,000.00 is debited from your account ending 7516 towards "
            "VPA priyankajagadeesha10@okaxis (PRIYANKA J) on 22-09-26."
        )

        result = try_extract_hdfc("HDFC Bank <alerts@hdfcbank.bank.in>", body, DEFAULT_CATEGORIES)

        self.assertIsNotNone(result)
        self.assertEqual(result.amount, 1000)
        self.assertEqual(result.merchant, "Priyanka J")
        self.assertEqual(result.type, TransactionType.DEBIT)
        self.assertEqual(result.category, "Other")

    def test_parses_known_credit_template(self):
        body = (
            "Rs.1000.00 has been successfully credited to your HDFC Bank account ending in 7516. "
            "Transaction Details: Sender: NELATURU AVINASH (VPA: avinash@okaxis)."
        )

        result = try_extract_hdfc("alerts@hdfcbank.bank.in", body, DEFAULT_CATEGORIES)

        self.assertIsNotNone(result)
        self.assertEqual(result.merchant, "Nelaturu Avinash")
        self.assertEqual(result.type, TransactionType.CREDIT)

    def test_changed_template_fails_safe_and_registers_as_drift(self):
        body = "Rs.750.00 is debited from your account. Counterparty details are available in the app."

        self.assertIsNone(try_extract_hdfc("alerts@hdfcbank.bank.in", body, DEFAULT_CATEGORIES))
        self.assertTrue(looks_like_hdfc_transaction("alerts@hdfcbank.bank.in", body))

    def test_non_hdfc_sender_never_uses_hdfc_rules(self):
        body = "Rs.500.00 is debited towards VPA cafe@ybl (BLUE TOKAI)."

        self.assertIsNone(try_extract_hdfc("alerts@example.com", body, DEFAULT_CATEGORIES))


if __name__ == "__main__":
    unittest.main()
