"""Registry and message dispatcher for Jupyter comms."""

from __future__ import annotations

from traitlets.config import LoggingConfigurable


class CommManager(LoggingConfigurable):
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.comms = {}
        self.targets = {}

    def register_target(self, target_name, callback):
        self.targets[target_name] = callback

    def unregister_target(self, target_name, callback=None):
        current = self.targets.get(target_name)
        if callback is None or current is callback:
            return self.targets.pop(target_name, None)
        return None

    def register_comm(self, comm):
        self.comms[comm.comm_id] = comm
        return comm.comm_id

    def unregister_comm(self, comm):
        return self.comms.pop(comm.comm_id, None)

    def get_comm(self, comm_id):
        return self.comms.get(comm_id)

    def comm_open(self, stream, ident, msg):
        from . import create_comm

        content = msg.get("content", {})
        comm_id = content.get("comm_id")
        target_name = content.get("target_name", "")
        callback = self.targets.get(target_name)
        if callback is None:
            self.log.error("No such comm target registered: %s", target_name)
            return None
        comm = create_comm(
            comm_id=comm_id,
            primary=False,
            target_name=target_name,
        )
        self.register_comm(comm)
        try:
            callback(comm, msg)
        except Exception:
            self.log.exception("Exception opening comm with target: %s", target_name)
            comm.close()
            raise
        return comm

    def comm_msg(self, stream, ident, msg):
        content = msg.get("content", {})
        comm = self.get_comm(content.get("comm_id"))
        if comm is None:
            self.log.error("No such comm: %s", content.get("comm_id"))
            return None
        return comm.handle_msg(msg)

    def comm_close(self, stream, ident, msg):
        content = msg.get("content", {})
        comm = self.comms.pop(content.get("comm_id"), None)
        if comm is None:
            self.log.error("No such comm: %s", content.get("comm_id"))
            return None
        return comm.handle_close(msg)
