import json
import sys

from agent_reach.channels.web import WebChannel

url = json.load(sys.stdin)["url"]
try:
    text = WebChannel().read(url, timeout=9)
    if not text.strip() or "Warning: Target URL returned error" in text:
        raise ValueError("Reference unavailable")
    print(json.dumps({"text": text[:6000]}))
except (OSError, RuntimeError, ValueError):
    sys.exit(1)
