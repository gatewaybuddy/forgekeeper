FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY forgekeeper ./forgekeeper
EXPOSE ${PYTHON_PORT}
CMD ["python", "-m", "forgekeeper.main"]
