# syntax=docker/dockerfile:1

# The Session Game service: the standard library's HTTP server and SQLite,
# plus python-chess to replay each reported game. Nothing else from the
# pipeline is installed. Base image pinned by digest: a tag can be moved, a
# digest cannot.
FROM python:3.12.15-alpine3.24@sha256:1b668429b3511ab407d8e00648891631b0b1a4d7e15e3ca70f38ab5b91ad4ab4

# Logs reach `docker logs` as they are written; no bytecode is written to a
# read-only filesystem.
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1

RUN pip install --no-cache-dir chess==1.11.2

# An unprivileged user, owner of the directory the database lives in. A
# named volume mounted on /data takes this ownership on first use.
RUN adduser -D -H -u 10001 chessme \
  && install -d -o chessme -g chessme /data

WORKDIR /app
COPY pipeline/__init__.py pipeline/session_games.py pipeline/serve_session_games.py ./pipeline/

USER chessme
EXPOSE 8787

# Every interface of the container, so the reverse proxy can reach it. The
# container publishes no port: the proxy stays the only way in.
CMD ["python", "-m", "pipeline.serve_session_games", "--database", "/data/session-games.sqlite", "--host", "0.0.0.0", "--port", "8787"]

# The reverse proxy only routes to a healthy container. Checked every second
# while starting, so a deployment does not wait a full interval.
HEALTHCHECK --interval=30s --timeout=3s --retries=3 --start-period=20s --start-interval=1s \
  CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8787/api/session-games/counts', timeout=2)"]
