FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PORT=4173
WORKDIR /app
COPY . /app
RUN useradd --system --uid 10001 muaero && mkdir -p /var/lib/muaero/state && chown -R muaero:muaero /var/lib/muaero/state
USER muaero
EXPOSE 4173
HEALTHCHECK --interval=30s --timeout=5s CMD python3 -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:4173/api/health',timeout=3)"
CMD ["python3","server.py"]
