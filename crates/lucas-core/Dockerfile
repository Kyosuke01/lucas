# Contexte de build : la racine du dépôt.
FROM rust:1-slim-trixie AS build
WORKDIR /src
COPY Cargo.toml Cargo.lock ./
COPY crates ./crates
RUN cargo build --release --locked -p lucas-core

FROM debian:trixie-slim AS runtime
RUN useradd --system --no-create-home lucas
COPY --from=build /src/target/release/lucas-core /usr/local/bin/lucas-core
# Les volumes montés ici héritent de ce propriétaire.
RUN mkdir /data /uploads && chown lucas /data /uploads
ENV LUCAS_UPLOADS_DIR=/uploads
USER lucas

# Examine les fichiers joints, avec les seuls outils nécessaires à leur lecture.
FROM runtime AS sandbox
USER root
RUN apt-get update \
    && apt-get install -y --no-install-recommends file poppler-utils unzip \
       ffmpeg tesseract-ocr tesseract-ocr-fra tesseract-ocr-eng \
    && rm -rf /var/lib/apt/lists/*
USER lucas
CMD ["lucas-core", "sandbox"]

# Dernière étape : celle construite par défaut.
FROM runtime AS core
ENV LUCAS_DATA_DIR=/data
# Dans le conteneur seulement ; Compose ne publie le port que sur 127.0.0.1.
ENV LUCAS_CORE_ADDR=0.0.0.0:8000
EXPOSE 8000
CMD ["lucas-core"]
