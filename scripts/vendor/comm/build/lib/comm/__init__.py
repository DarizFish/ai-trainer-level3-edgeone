"""Small, browser-safe implementation of the public Jupyter ``comm`` API."""

from .base_comm import BaseComm
from .manager import CommManager

__version__ = "0.2.3+ai.trainer.1"

_comm_manager = CommManager()
_comm_create = BaseComm


def get_comm_manager():
    return _comm_manager


def set_comm_manager(comm_manager):
    global _comm_manager
    _comm_manager = comm_manager


def create_comm(*args, **kwargs):
    return _comm_create(*args, **kwargs)


def set_comm_create(comm_create):
    global _comm_create
    _comm_create = comm_create


__all__ = [
    "BaseComm",
    "CommManager",
    "create_comm",
    "get_comm_manager",
    "set_comm_create",
    "set_comm_manager",
]
