import pytest
import math
import sys
import os
# ensure project root is importable when running tests
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from mountain_bike import Terrain, Rider


def test_terrain_interpolation():
    t = Terrain(seed=1)
    # pick a point between first and second
    x1, y1 = t.points[0]
    x2, y2 = t.points[1]
    midx = (x1 + x2) / 2
    midy = t.get_ground_y(midx)
    assert min(y1, y2) <= midy <= max(y1, y2)


def test_rider_stability():
    t = Terrain(seed=2)
    r = Rider(200, t.get_ground_y(200) - 12)
    # simulate some frames with dt
    max_vy = 0
    class KeyState:
        def __init__(self):
            self._d = {}
        def __getitem__(self, k):
            return self._d.get(k, False)

    keys = KeyState()
    for i in range(60):
        r.update(1/60.0, t, keys)
        max_vy = max(max_vy, abs(r.vy))
    # expect vy not to explode; set a conservative threshold
    assert max_vy < 5000
