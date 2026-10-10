"""Falsifier for the alleged-mj12-documen-5d9d42 permalink collision cure.

Before the cure, three truncated permalinks were claimed by seven level-3
``*_index.md`` documents (2+3+2 colliding), shadowing four indexes. The cure
keeps the live winner at each shared route and gives every shadowed index a
unique ``-<index title>`` suffixed permalink.
"""
import io
import json
import re
import unittest
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAGES = ROOT / "pages"
FRONT_MATTER = re.compile(r"^---\s*\n(.*?)\n---\s*\n", re.S)
PERMALINK = re.compile(r"^permalink:\s*[\"']?([^\s\"'#]+)[\"']?\s*$", re.M)


def page_permalinks():
    out = {}
    for p in PAGES.glob("*.md"):
        m = FRONT_MATTER.match(p.read_text(encoding="utf-8", errors="replace"))
        if not m:
            continue
        pm = PERMALINK.search(m.group(1))
        if pm:
            out[p.name] = pm.group(1)
    return out


SHARED_SLUGS = {
    "/alleged-mj12-documen-5d9d42-cutler/",
    "/alleged-mj12-documen-5d9d42-mj12/",
    "/alleged-mj12-documen-5d9d42-truman/",
}

EXPECTED_CURED = {
    "/alleged-mj12-documen-5d9d42-cutler-cutler-abroad/",
    "/alleged-mj12-documen-5d9d42-mj12-secrecy-problem/",
    "/alleged-mj12-documen-5d9d42-mj12-security-markings/",
    "/alleged-mj12-documen-5d9d42-truman-truman-timeline/",
}


class TestPermalinkUniqueness(unittest.TestCase):
    def test_all_permalinks_unique(self):
        pls = page_permalinks()
        counts = Counter(pls.values())
        dups = {k: v for k, v in counts.items() if v > 1}
        owners = {k: sorted(n for n, v in pls.items() if v == k) for k in dups}
        self.assertEqual({}, owners)

    def test_shared_family_slugs_claimed_by_one_document(self):
        pls = page_permalinks()
        for slug in SHARED_SLUGS:
            owners = sorted(n for n, v in pls.items() if v == slug)
            self.assertEqual(1, len(owners), f"{slug} claimed by {owners}")

    def test_expected_cured_index_routes_exist(self):
        pls = set(page_permalinks().values())
        self.assertEqual(set(), EXPECTED_CURED - pls)

    def test_manifest_canonical_routes_for_cured_indexes(self):
        # The manifest predates the cure and carries pre-existing drift;
        # pin only that the four cured entries carry the new routes.
        manifest = json.loads(io.open(ROOT / "phoenix-manifest.json", encoding="utf-8").read())
        cured = {
            "alleged-mj12-documen-5d9d42-cutler-travel-date-7065ab:index": "/alleged-mj12-documen-5d9d42-cutler-cutler-abroad/",
            "alleged-mj12-documen-5d9d42-mj12-secrecy-verific-491d7b:index": "/alleged-mj12-documen-5d9d42-mj12-secrecy-problem/",
            "alleged-mj12-documen-5d9d42-mj12-security-markin-9b54bd:index": "/alleged-mj12-documen-5d9d42-mj12-security-markings/",
            "alleged-mj12-documen-5d9d42-truman-1947-authoriz-cea4cc:index": "/alleged-mj12-documen-5d9d42-truman-truman-timeline/",
        }
        bad = []
        for page in manifest.get("pages", []):
            lid = page.get("logical_id")
            if lid in cured:
                route = "/" + (page.get("canonical_url") or "").split("/", 3)[-1].split("/", 1)[-1]
                if route != cured[lid]:
                    bad.append((lid, route, cured[lid]))
        self.assertEqual([], bad)

    def test_index_bodies_link_only_existing_routes(self):
        existing = set(page_permalinks().values())
        dangling = []
        for p in PAGES.glob("*_index.md"):
            for m in re.finditer(r"\{\{\s*'(/[^']*?)'\s*\|\s*relative_url", p.read_text(encoding="utf-8", errors="replace")):
                if m.group(1) not in existing:
                    dangling.append((p.name, m.group(1)))
        self.assertEqual([], dangling)


if __name__ == "__main__":
    unittest.main()
