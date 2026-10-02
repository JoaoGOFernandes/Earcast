FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    wget curl python3 python3-pip ffmpeg \
  && rm -rf /var/lib/apt/lists/*

# Instala o Piper (extrai para /usr/local/bin/piper/)
RUN wget -q https://github.com/rhasspy/piper/releases/latest/download/piper_linux_x86_64.tar.gz \
  && tar -xzf piper_linux_x86_64.tar.gz -C /usr/local/bin/ \
  && rm piper_linux_x86_64.tar.gz

# Necessário para as libs do Piper (libpiper_phonemize etc)
ENV LD_LIBRARY_PATH=/usr/local/bin/piper

# Modelos de voz incluídos na imagem
COPY models/ /models/

WORKDIR /app
COPY requirements.txt .
RUN pip3 install -r requirements.txt --break-system-packages

COPY server.py .

EXPOSE 8000
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]
