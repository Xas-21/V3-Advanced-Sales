"""Characterization: data_access._signed_ledger_amount sign map (pure; no DB)."""
from data_access import _signed_ledger_amount


def test_deposit_and_collection_are_positive():
    assert _signed_ledger_amount("deposit", 1000) == 1000.0
    assert _signed_ledger_amount("deposit", -1000) == 1000.0
    assert _signed_ledger_amount("collection", 250.5) == 250.5
    assert _signed_ledger_amount("collection", -250.5) == 250.5


def test_allocation_cl_charge_refund_are_negative():
    assert _signed_ledger_amount("allocation", 4000) == -4000.0
    assert _signed_ledger_amount("allocation", -4000) == -4000.0
    assert _signed_ledger_amount("cl_charge", 25000) == -25000.0
    assert _signed_ledger_amount("cl_charge", -25000) == -25000.0
    assert _signed_ledger_amount("refund", 1500) == -1500.0
    assert _signed_ledger_amount("refund", -1500) == -1500.0


def test_adjustment_keeps_sign_as_is():
    assert _signed_ledger_amount("adjustment", 75) == 75.0
    assert _signed_ledger_amount("adjustment", -75) == -75.0
    assert _signed_ledger_amount("adjustment", 0) == 0.0


def test_unknown_or_blank_type_keeps_amount_as_is():
    assert _signed_ledger_amount("", 42) == 42.0
    assert _signed_ledger_amount(None, -9) == -9.0
    assert _signed_ledger_amount("mystery", 3) == 3.0
