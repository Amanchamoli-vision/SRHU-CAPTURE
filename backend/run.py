"""Start the API server.

Locally (`python run.py`) it listens on 0.0.0.0:8000 with auto-reload, so
phones and laptops on the same network can reach it.

On Railway the platform sets PORT, which switches auto-reload off. Railway ends
HTTPS at its proxy, so the proxy headers are trusted: without them every request
looks like plain http and the /files/... URLs handed to the browser would be
http://, which an https frontend blocks as mixed content.
"""

import os

import uvicorn


if __name__ == "__main__":
    on_platform = "PORT" in os.environ
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=int(os.environ.get("PORT", "8000")),
        reload=os.environ.get("RELOAD", "false" if on_platform else "true").lower() == "true",
        proxy_headers=True,
        forwarded_allow_ips="*",
    )
