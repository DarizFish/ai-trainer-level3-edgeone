"""Base class shared by Jupyter comm implementations."""

from __future__ import annotations

from uuid import uuid4

from traitlets.config import LoggingConfigurable


class BaseComm(LoggingConfigurable):
    def __init__(
        self,
        target_name="",
        data=None,
        metadata=None,
        buffers=None,
        comm_id=None,
        primary=True,
        **kwargs,
    ):
        super().__init__(**kwargs)
        self.comm_id = comm_id or uuid4().hex
        self.target_name = target_name
        self.topic = f"comm-{self.comm_id}".encode("ascii")
        self.primary = primary
        self._closed = False
        self._msg_callback = None
        self._close_callback = None
        if primary:
            from . import get_comm_manager

            get_comm_manager().register_comm(self)
            self.open(data=data, metadata=metadata, buffers=buffers)

    def publish_msg(self, msg_type, data=None, metadata=None, buffers=None, **keys):
        raise NotImplementedError

    def open(self, data=None, metadata=None, buffers=None):
        if self._closed:
            return
        self.publish_msg(
            "comm_open",
            data=data,
            metadata=metadata,
            buffers=buffers,
            target_name=self.target_name,
        )

    def send(self, data=None, metadata=None, buffers=None):
        if self._closed:
            return
        self.publish_msg("comm_msg", data=data, metadata=metadata, buffers=buffers)

    def close(self, data=None, metadata=None, buffers=None, deleting=False):
        if self._closed:
            return
        self._closed = True
        if not deleting:
            self.publish_msg("comm_close", data=data, metadata=metadata, buffers=buffers)
        from . import get_comm_manager

        get_comm_manager().unregister_comm(self)

    def on_msg(self, callback):
        self._msg_callback = callback

    def on_close(self, callback):
        self._close_callback = callback

    def handle_msg(self, msg):
        if self._msg_callback is not None:
            return self._msg_callback(msg)
        return None

    def handle_close(self, msg):
        self._closed = True
        if self._close_callback is not None:
            return self._close_callback(msg)
        return None

    def __del__(self):
        try:
            self.close(deleting=True)
        except Exception:
            pass
