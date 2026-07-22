from sort_order import sort_by_sort_order


def test_sort_by_sort_order_missing_last_and_id_tiebreak():
    rows = [
        {"id": "b", "sortOrder": 2, "name": "B"},
        {"id": "a", "name": "A"},
        {"id": "c", "sortOrder": 0, "name": "C"},
        {"id": "d", "sortOrder": 2, "name": "D"},
    ]
    assert [r["id"] for r in sort_by_sort_order(rows)] == ["c", "b", "d", "a"]


def test_sort_by_sort_order_does_not_mutate():
    rows = [{"id": "z", "sortOrder": 1}, {"id": "y", "sortOrder": 0}]
    out = sort_by_sort_order(rows)
    assert rows[0]["id"] == "z"
    assert [r["id"] for r in out] == ["y", "z"]
