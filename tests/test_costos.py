import pytest

from scripts.monitor.costos import a_megabytes


def test_megabytes():
    assert a_megabytes("256m") == 256


def test_gigabytes():
    assert a_megabytes("1g") == 1024


def test_limite_invalido():
    with pytest.raises(ValueError):
        a_megabytes("mucho")
