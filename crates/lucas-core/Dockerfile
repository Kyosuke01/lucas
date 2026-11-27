# Contexte de build : la racine du dépôt.
FROM rust:1-slim-trixie AS build
WORKDIR /src
COPY Cargo.toml Cargo.lock ./
COPY crates ./crates
RUN cargo build --release --locked -p lucas-core

FROM debian:trixie-slim
RUN useradd --system --no-create-home lucas
COPY --from=build /src/target/release/lucas-core /usr/local/bin/lucas-core
# Le volume monté ici hérite de ce propriétaire.
RUN mkdir /data && chown lucas /data
ENV LUCAS_DATA_DIR=/data
USER lucas
# Dans le conteneur seulement ; Compose ne publie le port que sur 127.0.0.1.
ENV LUCAS_CORE_ADDR=0.0.0.0:8000
EXPOSE 8000
CMD ["lucas-core"]
