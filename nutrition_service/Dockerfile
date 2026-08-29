FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .
COPY src ./src
# Engine tư vấn đọc CSV từ data/processed (NutritionConsultant khởi tạo lúc import)
COPY data/processed ./data/processed

ENV PYTHONUNBUFFERED=1
ENV FLASK_APP=app.py
ENV NUTRITION_PORT=5000

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -sf http://127.0.0.1:5000/api/health || exit 1

CMD ["python", "app.py"]
