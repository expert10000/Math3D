FROM sagemath/sagemath:latest

WORKDIR /app

COPY service/requirements.txt .
USER root
RUN sage -pip install --no-cache-dir -r requirements.txt

COPY service/ ./service/
RUN chown -R sage:sage /app
USER sage

EXPOSE 8767

CMD ["sage", "-python", "-m", "uvicorn", "service.app:app", "--host", "0.0.0.0", "--port", "8767"]
