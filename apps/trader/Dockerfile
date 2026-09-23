FROM python:3.11-slim

RUN useradd --create-home --uid 10001 trader
WORKDIR /app
COPY pyproject.toml ./
COPY trader ./trader
COPY tests ./tests
RUN pip install --no-cache-dir pytest && python -m pytest -q tests

USER trader
ENV TRADER_MODE=PAPER ZERO_COST_MODE=true TRADER_DB_PATH=/data/trader.db
VOLUME ["/data"]
EXPOSE 8050
ENTRYPOINT ["python", "-m", "trader"]
CMD ["status"]
