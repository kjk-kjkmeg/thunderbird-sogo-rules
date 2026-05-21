ALLOWED_FIELDS = {"from", "to", "cc", "header"}
ALLOWED_OPERATORS = {"is", "contains"}


def build_fileinto_filter(*, name, field, operator, value, folder):
    if field not in ALLOWED_FIELDS:
        raise ValueError("unsupported field")
    if operator not in ALLOWED_OPERATORS:
        raise ValueError("unsupported operator")
    if not folder.startswith("INBOX/"):
        raise ValueError("folder must start with INBOX/")
    return {
        "active": 1,
        "name": name,
        "match": "all",
        "rules": [{"field": field, "operator": operator, "value": value}],
        "actions": [
            {"method": "fileinto", "argument": folder},
            {"method": "stop", "argument": ""},
        ],
    }
