FROM python:3.11-slim

RUN apt-get update && apt-get install -y \
    octave \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY service/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY service/ ./service/
COPY scripts/ ./scripts/

EXPOSE 8766

CMD ["uvicorn", "service.app:app", "--host", "0.0.0.0", "--port", "8766"]
