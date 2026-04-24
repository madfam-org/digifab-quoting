FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    libgeos-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY apps/worker/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY apps/worker/ .

# Expose port
EXPOSE 8000

# Run the application


# Audit 2026-04-23 (cross-cutting I.1): run as non-root UID 10001 to
# satisfy Kyverno restricted pod-security. No special caps or privileged
# paths are needed — standard uvicorn / module entrypoint.
RUN groupadd -r app -g 10001 && useradd -r -u 10001 -g app app \
    && chown -R app:app /app
USER app

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]