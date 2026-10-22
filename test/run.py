#!/usr/bin/env python3
"""Run the smoke suite in headless Chrome, no dependencies.

Builds test/frogmouth.test.html, serves it on 127.0.0.1 (so the Origin
Private File System is available for real file writes), drives Chrome over
the DevTools pipe and prints the results. Exit code 1 on any failure.

    python3 test/run.py            # CHROME=/path/to/chrome to override
"""
import functools, http.server, json, os, pathlib, shutil, subprocess, sys, tempfile, threading, time

ROOT = pathlib.Path(__file__).resolve().parent.parent
CHROME = os.environ.get("CHROME") or next(
    (p for p in ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
                 shutil.which("google-chrome") or "", shutil.which("chromium") or "",
                 shutil.which("chrome") or ""] if p and os.path.exists(p)), None)


def serve():
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a): pass
    handler = functools.partial(Quiet, directory=str(ROOT))
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


class Pipe:
    """Chrome --remote-debugging-pipe: JSON messages, NUL-terminated, on fds 3 (in) / 4 (out)."""
    def __init__(self, url):
        r_in, self.w = os.pipe()          # we write -> chrome fd 3
        self.r, w_out = os.pipe()         # chrome fd 4 -> we read
        self.profile = tempfile.mkdtemp()
        def child():
            os.dup2(r_in, 3); os.dup2(w_out, 4)
        self.proc = subprocess.Popen(
            [CHROME, "--headless=new", "--disable-gpu", "--remote-debugging-pipe",
             f"--user-data-dir={self.profile}", "--no-first-run", url],
            pass_fds=(3, 4), preexec_fn=child,  # keep the dup'ed fds open after exec
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        os.close(r_in); os.close(w_out)
        self.buf, self.n = b"", 0

    def call(self, method, params=None, session=None):
        self.n += 1
        msg = {"id": self.n, "method": method, "params": params or {}}
        if session: msg["sessionId"] = session
        os.write(self.w, json.dumps(msg).encode() + b"\0")
        while True:
            while b"\0" not in self.buf:
                chunk = os.read(self.r, 1 << 16)
                if not chunk: raise RuntimeError("chrome exited")
                self.buf += chunk
            raw, self.buf = self.buf.split(b"\0", 1)
            reply = json.loads(raw)
            if reply.get("id") == self.n:
                if "error" in reply: raise RuntimeError(reply["error"])
                return reply.get("result", {})

    def close(self):
        self.proc.kill(); self.proc.wait()
        shutil.rmtree(self.profile, ignore_errors=True)


def main():
    if not CHROME:
        print("Chrome not found; set CHROME=/path/to/chrome"); return 2
    subprocess.run([sys.executable, str(ROOT / "build.py"), "--test"], check=True, stdout=subprocess.DEVNULL)
    srv = serve()
    url = f"http://127.0.0.1:{srv.server_address[1]}/test/frogmouth.test.html#smoke"
    chrome = Pipe("about:blank")
    try:
        targets = chrome.call("Target.getTargets")["targetInfos"]
        page = next(t for t in targets if t["type"] == "page")
        session = chrome.call("Target.attachToTarget", {"targetId": page["targetId"], "flatten": True})["sessionId"]
        chrome.call("Page.navigate", {"url": url}, session)
        deadline = time.time() + 60
        while time.time() < deadline:
            res = chrome.call("Runtime.evaluate", {"expression": "(document.getElementById('results')||{}).textContent||''", "returnByValue": True}, session)
            text = res.get("result", {}).get("value", "")
            if text:
                print(text)
                return 0 if "\nFAIL" not in text else 1
            time.sleep(0.25)
        res = chrome.call("Runtime.evaluate", {"expression": "JSON.stringify((window.__smoke||[]).slice(-4))", "returnByValue": True}, session)
        print("timed out waiting for results; last recorded:", res.get("result", {}).get("value")); return 1
    finally:
        chrome.close(); srv.shutdown()


if __name__ == "__main__":
    sys.exit(main())
