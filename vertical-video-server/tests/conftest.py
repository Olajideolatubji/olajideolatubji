"""Point the whole suite at throwaway sqlite + storage before any app import."""

import os
import tempfile

_TMP = tempfile.mkdtemp(prefix="vvs-tests-")

os.environ["DATABASE_URL"] = f"sqlite:///{_TMP}/test.db"
os.environ["STORAGE_ROOT"] = os.path.join(_TMP, "data")
os.environ["REDIS_URL"] = "redis://127.0.0.1:6379/15"
os.environ["OPERATOR_PASSWORD"] = "test-password"
os.environ["SECRET_KEY"] = "test-secret-key-value"
os.environ["MONTHLY_COST_CAP_USD"] = "1000"
os.environ.setdefault("HEYGEN_API_KEY", "test-key")
os.environ.setdefault("HEYGEN_TEMPLATE_ID", "tmpl-test")

os.makedirs(os.environ["STORAGE_ROOT"], exist_ok=True)

TMP_ROOT = _TMP
